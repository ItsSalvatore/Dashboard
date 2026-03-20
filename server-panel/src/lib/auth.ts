import { cookies } from "next/headers";
import { createHmac, timingSafeEqual } from "node:crypto";
import bcrypt from "bcryptjs";
import {
  getAuthSecret,
  isAuthConfigured,
  PANEL_SESSION_COOKIE_NAME,
} from "./auth-config";

const SESSION_TTL_MS = 24 * 60 * 60 * 1000; // 24h

export async function verifyPassword(password: string): Promise<boolean> {
  const hash = process.env.PANEL_PASSWORD_HASH?.trim();
  const plain = process.env.PANEL_PASSWORD?.trim();
  if (hash) {
    return bcrypt.compare(password, hash);
  }
  if (plain) {
    const buf = Buffer.from(password.trim(), "utf8");
    const ref = Buffer.from(plain, "utf8");
    return buf.length === ref.length && timingSafeEqual(buf, ref);
  }
  return false;
}

function sign(payload: string): string {
  const sig = createHmac("sha256", getAuthSecret()).update(payload).digest("hex");
  return `${Buffer.from(payload).toString("base64url")}.${sig}`;
}

function verify(token: string): { valid: boolean; payload?: { user: string; exp: number } } {
  try {
    const [raw, sig] = token.split(".");
    if (!raw || !sig) return { valid: false };
    const expected = createHmac("sha256", getAuthSecret()).update(raw).digest("hex");
    if (!timingSafeEqual(Buffer.from(sig, "hex"), Buffer.from(expected, "hex"))) {
      return { valid: false };
    }
    const payload = JSON.parse(Buffer.from(raw, "base64url").toString()) as {
      user: string;
      exp: number;
    };
    if (payload.exp < Date.now()) return { valid: false };
    return { valid: true, payload };
  } catch {
    return { valid: false };
  }
}

export async function getSession(): Promise<boolean> {
  const cookieStore = await cookies();
  const token = cookieStore.get(PANEL_SESSION_COOKIE_NAME)?.value;
  if (!token) return false;
  const { valid } = verify(token);
  return valid;
}

export async function getAuthState(): Promise<{ configured: boolean; authorized: boolean }> {
  if (!isAuthConfigured()) {
    return { configured: false, authorized: false };
  }

  return {
    configured: true,
    authorized: await getSession(),
  };
}

export async function requireAuth(): Promise<{ configured: boolean; authorized: boolean }> {
  return getAuthState();
}

export function createSessionToken(): string {
  const payload = JSON.stringify({
    user: "admin",
    exp: Date.now() + SESSION_TTL_MS,
  });
  return sign(payload);
}

export function getCookieConfig() {
  return {
    name: PANEL_SESSION_COOKIE_NAME,
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax" as const,
    path: "/",
    maxAge: SESSION_TTL_MS / 1000,
  };
}
