import { NextResponse } from "next/server";
import { verifyPassword } from "@/lib/auth";
import { createSessionToken, getCookieConfig } from "@/lib/auth";
import { AUTH_SETUP_MESSAGE, isAuthConfigured } from "@/lib/auth-config";
import { recordAuditEvent } from "@/lib/audit";
import { readTwoFactorConfig, verifyTotpCode } from "@/lib/totp";
import {
  clearLoginFailures,
  getClientIp,
  getLoginRateLimitState,
  recordLoginFailure,
} from "@/lib/rate-limit";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  if (!isAuthConfigured()) {
    return NextResponse.json(
      { error: AUTH_SETUP_MESSAGE },
      { status: 503 }
    );
  }

  const clientIp = getClientIp(request);
  const limitState = getLoginRateLimitState(clientIp);
  if (!limitState.allowed) {
    await recordAuditEvent({
      timestamp: new Date().toISOString(),
      action: "auth.login",
      actor: clientIp,
      outcome: "failure",
      details: { reason: "rate_limited", retryAfterSeconds: limitState.retryAfterSeconds },
    });
    return NextResponse.json(
      { error: "Too many login attempts. Try again later." },
      {
        status: 429,
        headers: {
          "Retry-After": String(limitState.retryAfterSeconds),
        },
      }
    );
  }

  try {
    const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
    const password = body.password;
    const twoFactorCode = typeof body.twoFactorCode === "string" ? body.twoFactorCode : "";
    if (typeof password !== "string" || !password) {
      return NextResponse.json({ error: "Password required" }, { status: 400 });
    }

    const valid = await verifyPassword(password);
    if (!valid) {
      recordLoginFailure(clientIp);
      await recordAuditEvent({
        timestamp: new Date().toISOString(),
        action: "auth.login",
        actor: clientIp,
        outcome: "failure",
        details: { reason: "invalid_password" },
      });
      return NextResponse.json({ error: "Invalid password" }, { status: 401 });
    }

    const twoFactorConfig = await readTwoFactorConfig();
    if (twoFactorConfig.enabled) {
      if (!twoFactorCode.trim()) {
        recordLoginFailure(clientIp);
        return NextResponse.json(
          { error: "Authenticator code required", requiresTwoFactor: true },
          { status: 401 }
        );
      }

      if (!twoFactorConfig.secret || !verifyTotpCode(twoFactorConfig.secret, twoFactorCode)) {
        recordLoginFailure(clientIp);
        await recordAuditEvent({
          timestamp: new Date().toISOString(),
          action: "auth.login",
          actor: clientIp,
          outcome: "failure",
          details: { reason: "invalid_2fa" },
        });
        return NextResponse.json(
          { error: "Invalid authenticator code", requiresTwoFactor: true },
          { status: 401 }
        );
      }
    }

    clearLoginFailures(clientIp);
    const token = createSessionToken();
    const config = getCookieConfig();
    const res = NextResponse.json({ ok: true });
    res.cookies.set(config.name, token, {
      httpOnly: config.httpOnly,
      secure: config.secure,
      sameSite: config.sameSite,
      path: config.path,
      maxAge: config.maxAge,
    });
    await recordAuditEvent({
      timestamp: new Date().toISOString(),
      action: "auth.login",
      actor: clientIp,
      outcome: "success",
    });
    return res;
  } catch {
    recordLoginFailure(clientIp);
    await recordAuditEvent({
      timestamp: new Date().toISOString(),
      action: "auth.login",
      actor: clientIp,
      outcome: "failure",
      details: { reason: "server_error" },
    });
    return NextResponse.json({ error: "Login failed" }, { status: 500 });
  }
}
