import { NextResponse } from "next/server";
import { getCookieConfig } from "@/lib/auth";

export const dynamic = "force-dynamic";

export async function POST() {
  const config = getCookieConfig();
  const res = NextResponse.json({ ok: true });
  res.cookies.set(config.name, "", { path: config.path, maxAge: 0 });
  return res;
}
