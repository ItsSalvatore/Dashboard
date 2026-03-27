import { NextResponse } from "next/server";
import { existsSync } from "fs";
import { join } from "path";
import { requireAuth } from "@/lib/auth";
import { runCommand } from "@/lib/commands";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const WEB_ROOT = process.env.WEB_ROOT || "/var/www";
const NGINX_AVAILABLE = "/etc/nginx/sites-available";
const BIND_ZONE_DIR = "/etc/bind/zones";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ domain: string }> }
) {
  const { authorized } = await requireAuth();
  if (!authorized)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const domain = (await params).domain;
  if (!domain || domain.includes("..") || domain.includes("/")) {
    return NextResponse.json({ error: "Invalid domain" }, { status: 400 });
  }

  try {
    const siteRoot = join(WEB_ROOT, domain);
    const configPath = join(NGINX_AVAILABLE, domain);
    const zoneFile = join(BIND_ZONE_DIR, `${domain}.zone`);

    const exists = existsSync(siteRoot);
    const hasNginxConfig = existsSync(configPath);
    const hasDnsZone = existsSync(zoneFile);

    let sslCert: { domain: string; expiry: string } | null = null;
    try {
      const { stdout } = await runCommand("certbot", ["certificates"]);
      const blocks = stdout.split(/Certificate Name:/).slice(1);
      for (const block of blocks) {
        const domainMatch = block.match(/^\s*(\S+)/);
        const expiryMatch = block.match(/Expiry Date:\s*(.+?)(?:\s+\(VALID|$)/);
        if (domainMatch && domainMatch[1] === domain && expiryMatch) {
          sslCert = { domain: domainMatch[1].trim(), expiry: expiryMatch[1].trim() };
          break;
        }
      }
    } catch {
      // certbot not available
    }

    return NextResponse.json({
      domain,
      root: siteRoot,
      exists,
      hasNginxConfig,
      hasDnsZone,
      sslCert,
    });
  } catch (error) {
    console.error("Website detail error:", error);
    return NextResponse.json(
      { error: "Failed to get website details" },
      { status: 500 }
    );
  }
}
