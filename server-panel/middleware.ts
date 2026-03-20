import { NextResponse, type NextRequest } from "next/server";
import {
  AUTH_SETUP_MESSAGE,
  getAuthSecret,
  isAuthConfigured,
  PANEL_SESSION_COOKIE_NAME,
} from "@/lib/auth-config";

function decodeBase64Url(value: string): string {
  const normalized = value.replace(/-/g, "+").replace(/_/g, "/");
  const padded = normalized + "=".repeat((4 - (normalized.length % 4)) % 4);
  return atob(padded);
}

function hexToBytes(value: string): Uint8Array | null {
  if (value.length % 2 !== 0 || /[^0-9a-f]/i.test(value)) {
    return null;
  }

  const bytes = new Uint8Array(value.length / 2);
  for (let i = 0; i < value.length; i += 2) {
    bytes[i / 2] = parseInt(value.slice(i, i + 2), 16);
  }

  return bytes;
}

async function verifySessionToken(token: string): Promise<boolean> {
  try {
    const [raw, sig] = token.split(".");
    const signature = sig ? hexToBytes(sig) : null;
    if (!raw || !signature) {
      return false;
    }

    const key = await crypto.subtle.importKey(
      "raw",
      new TextEncoder().encode(getAuthSecret()),
      { name: "HMAC", hash: "SHA-256" },
      false,
      ["verify"]
    );

    const signatureValid = await crypto.subtle.verify(
      "HMAC",
      key,
      signature,
      new TextEncoder().encode(raw)
    );

    if (!signatureValid) {
      return false;
    }

    const payload = JSON.parse(decodeBase64Url(raw)) as { exp?: number };
    return typeof payload.exp === "number" && payload.exp >= Date.now();
  } catch {
    return false;
  }
}

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  if (pathname.startsWith("/api/auth/")) {
    return NextResponse.next();
  }

  if (!isAuthConfigured()) {
    return NextResponse.json(
      {
        error: AUTH_SETUP_MESSAGE,
        configured: false,
        setupRequired: true,
      },
      { status: 503 }
    );
  }

  const token = request.cookies.get(PANEL_SESSION_COOKIE_NAME)?.value;
  const authorized = token ? await verifySessionToken(token) : false;

  if (!authorized) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/api/:path*"],
};
