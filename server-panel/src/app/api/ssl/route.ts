import { NextResponse } from "next/server";
import { exec } from "child_process";
import { promisify } from "util";
import { requireAuth } from "@/lib/auth";

const execAsync = promisify(exec);

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET() {
  try {
    const { stdout } = await execAsync("certbot certificates 2>/dev/null || true");
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
  try {
    const body = await request.json().catch(() => ({}));
    const action = body.action;
    const domain = (body.domain || "").trim().toLowerCase().replace(/[^a-z0-9.-]/g, "");

    if (action === "renew") {
      const { stdout, stderr } = await execAsync("certbot renew --non-interactive 2>&1");
      return NextResponse.json({
        ok: true,
        output: stdout + stderr,
      });
    }

    if (action === "issue" && domain) {
      const webRoot = process.env.WEB_ROOT || "/var/www";
      const siteRoot = `${webRoot}/${domain}`;
      const { stdout, stderr } = await execAsync(
        `certbot --nginx -d ${domain} -d www.${domain} --non-interactive --agree-tos --register-unsafely-without-email 2>&1 || certbot --webroot -w ${siteRoot} -d ${domain} -d www.${domain} --non-interactive --agree-tos --register-unsafely-without-email 2>&1`
      );
      return NextResponse.json({
        ok: true,
        domain,
        output: stdout + stderr,
      });
    }

    return NextResponse.json({ error: "Invalid action" }, { status: 400 });
  } catch (error: unknown) {
    const err = error as { stderr?: string };
    return NextResponse.json(
      { error: err.stderr ?? "certbot failed" },
      { status: 500 }
    );
  }
}
