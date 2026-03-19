import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";

export const dynamic = "force-dynamic";

export async function GET() {
  const configured = !!(process.env.PANEL_PASSWORD || process.env.PANEL_PASSWORD_HASH);
  if (!configured) {
    return NextResponse.json({ authorized: true, configured: false });
  }
  const authorized = await getSession();
  return NextResponse.json({ authorized, configured: true });
}
