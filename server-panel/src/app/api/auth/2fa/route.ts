import { NextResponse } from "next/server";
import { requireAuth, verifyPassword } from "@/lib/auth";
import { recordAuditEvent } from "@/lib/audit";
import {
  buildOtpAuthUri,
  generateTotpSecret,
  readTwoFactorConfig,
  verifyTotpCode,
  writeTwoFactorConfig,
} from "@/lib/totp";

export const dynamic = "force-dynamic";

export async function GET() {
  const { authorized } = await requireAuth();
  if (!authorized) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const config = await readTwoFactorConfig();
  return NextResponse.json({
    enabled: config.enabled,
    issuer: config.issuer,
    label: config.label,
    setupPending: Boolean(config.pendingSecret),
  });
}

export async function POST(request: Request) {
  const { authorized } = await requireAuth();
  if (!authorized) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = await request.json().catch(() => ({}));
    const action = typeof body.action === "string" ? body.action : "";
    const password = typeof body.password === "string" ? body.password : "";
    const code = typeof body.code === "string" ? body.code : "";
    const issuer = typeof body.issuer === "string" && body.issuer.trim() ? body.issuer.trim() : "Server Panel";
    const label = typeof body.label === "string" && body.label.trim() ? body.label.trim() : "admin";

    if (action === "setup") {
      const passwordValid = await verifyPassword(password);
      if (!passwordValid) {
        return NextResponse.json({ error: "Current password is required" }, { status: 401 });
      }

      const config = await readTwoFactorConfig();
      const pendingSecret = generateTotpSecret();
      const nextConfig = {
        ...config,
        issuer,
        label,
        pendingSecret,
      };
      await writeTwoFactorConfig(nextConfig);

      await recordAuditEvent({
        timestamp: new Date().toISOString(),
        action: "auth.2fa.setup",
        actor: "admin",
        outcome: "success",
        details: { issuer, label },
      });

      return NextResponse.json({
        ok: true,
        enabled: config.enabled,
        setupPending: true,
        secret: pendingSecret,
        otpauthUri: buildOtpAuthUri({ issuer, label, secret: pendingSecret }),
      });
    }

    if (action === "confirm") {
      const config = await readTwoFactorConfig();
      if (!config.pendingSecret) {
        return NextResponse.json({ error: "No pending 2FA setup" }, { status: 400 });
      }
      if (!verifyTotpCode(config.pendingSecret, code)) {
        return NextResponse.json({ error: "Invalid authenticator code" }, { status: 401 });
      }

      await writeTwoFactorConfig({
        ...config,
        enabled: true,
        secret: config.pendingSecret,
        pendingSecret: null,
      });

      await recordAuditEvent({
        timestamp: new Date().toISOString(),
        action: "auth.2fa.confirm",
        actor: "admin",
        outcome: "success",
      });

      return NextResponse.json({ ok: true, enabled: true });
    }

    if (action === "disable") {
      const config = await readTwoFactorConfig();
      const passwordValid = await verifyPassword(password);
      if (!passwordValid) {
        return NextResponse.json({ error: "Current password is required" }, { status: 401 });
      }
      if (!config.secret || !verifyTotpCode(config.secret, code)) {
        return NextResponse.json({ error: "Valid authenticator code is required" }, { status: 401 });
      }

      await writeTwoFactorConfig({
        ...config,
        enabled: false,
        secret: null,
        pendingSecret: null,
      });

      await recordAuditEvent({
        timestamp: new Date().toISOString(),
        action: "auth.2fa.disable",
        actor: "admin",
        outcome: "success",
      });

      return NextResponse.json({ ok: true, enabled: false });
    }

    return NextResponse.json({ error: "Invalid action" }, { status: 400 });
  } catch (error) {
    console.error("2FA route error:", error);
    return NextResponse.json({ error: "2FA request failed" }, { status: 500 });
  }
}
