import { NextResponse } from "next/server";
import { readdir } from "fs/promises";
import { join } from "path";
import { requireAuth } from "@/lib/auth";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const NGINX_AVAILABLE = "/etc/nginx/sites-available";
const WEB_ROOT = process.env.WEB_ROOT || "/var/www";

export async function GET() {
  const { authorized } = await requireAuth();
  if (!authorized) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try {
    const files = await readdir(NGINX_AVAILABLE);
    const sites = files
      .filter((f) => !f.startsWith(".") && f !== "default")
      .map((name) => ({
        domain: name,
        configPath: join(NGINX_AVAILABLE, name),
        root: join(WEB_ROOT, name),
      }));
    return NextResponse.json({ sites });
  } catch {
    return NextResponse.json({ sites: [] });
  }
}
