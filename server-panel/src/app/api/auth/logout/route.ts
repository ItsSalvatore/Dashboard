import { NextResponse } from "next/server";
import { getCookieConfig } from "@/lib/auth";
import { recordAuditEvent } from "@/lib/audit";

export const dynamic = "force-dynamic";

export async function POST() {
  const config = getCookieConfig();
  const res = NextResponse.json({ ok: true });
  res.cookies.set(config.name, "", { path: config.path, maxAge: 0 });
  await recordAuditEvent({
    timestamp: new Date().toISOString(),
    action: "auth.logout",
    actor: "admin",
    outcome: "success",
  });
  return res;
}
