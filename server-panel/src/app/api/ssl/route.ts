import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { recordAuditEvent } from "@/lib/audit";
import { runCommand, runFirstSuccessful } from "@/lib/commands";

export const dynamic = "force-dynamic";
export const revalidate = 0;

async function readCertificates() {
  const { stdout } = await runCommand("certbot", ["certificates"]);
  const certs: { domain: string; expiry: string }[] = [];
  const blocks = stdout.split(/Certificate Name:/).slice(1);

  for (const block of blocks) {
    const domainMatch = block.match(/^\s*(\S+)/);
    const expiryMatch = block.match(/Expiry Date:\s*(.+?)(?:\s+\(VALID|$)/);
    if (domainMatch && expiryMatch) {
      certs.push({
        domain: domainMatch[1].trim(),
        expiry: expiryMatch[1].trim(),
      });
    }
  }

  return { stdout, certs };
}

export async function GET() {
  const { authorized } = await requireAuth();
  if (!authorized) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const { stdout, certs } = await readCertificates();

    return NextResponse.json({
      certs,
      certbotInstalled: stdout.length > 0,
    });
  } catch {
    return NextResponse.json({
      certs: [],
      certbotInstalled: false,
      message: "certbot not found or not in PATH",
    });
  }
}

export async function POST(request: Request) {
  const { authorized } = await requireAuth();
  if (!authorized) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  let actionName = "unknown";
  try {
    const body = await request.json().catch(() => ({}));
    const action = body.action;
    actionName = typeof action === "string" ? action : "unknown";
    const domain = (body.domain || "").trim().toLowerCase().replace(/[^a-z0-9.-]/g, "");

    if (action === "renew") {
      const { stdout, stderr } = await runCommand("certbot", ["renew", "--non-interactive"]);
      await recordAuditEvent({
        timestamp: new Date().toISOString(),
        action: "ssl.renew",
        actor: "admin",
        outcome: "success",
      });
      return NextResponse.json({
        ok: true,
        output: stdout + stderr,
      });
    }

    if (action === "issue" && domain) {
      const webRoot = process.env.WEB_ROOT || "/var/www";
      const siteRoot = `${webRoot}/${domain}`;
      const { stdout, stderr } = await runFirstSuccessful([
        {
          command: "certbot",
          args: [
            "--nginx",
            "-d",
            domain,
            "-d",
            `www.${domain}`,
            "--non-interactive",
            "--agree-tos",
            "--register-unsafely-without-email",
          ],
        },
        {
          command: "certbot",
          args: [
            "--webroot",
            "-w",
            siteRoot,
            "-d",
            domain,
            "-d",
            `www.${domain}`,
            "--non-interactive",
            "--agree-tos",
            "--register-unsafely-without-email",
          ],
        },
      ]);
      await recordAuditEvent({
        timestamp: new Date().toISOString(),
        action: "ssl.issue",
        actor: "admin",
        outcome: "success",
        details: { domain },
      });
      return NextResponse.json({
        ok: true,
        domain,
        output: stdout + stderr,
      });
    }

    return NextResponse.json({ error: "Invalid action" }, { status: 400 });
  } catch (error: unknown) {
    const err = error as { stderr?: string; stdout?: string; message?: string };
    await recordAuditEvent({
      timestamp: new Date().toISOString(),
      action: `ssl.${actionName}`,
      actor: "admin",
      outcome: "failure",
      details: { reason: err.message || "certbot_failed" },
    });
    return NextResponse.json(
      { error: err.stderr || err.stdout || err.message || "certbot failed" },
      { status: 500 }
    );
  }
}
