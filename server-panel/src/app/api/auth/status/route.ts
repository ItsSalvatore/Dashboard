import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json({
    configured: !!(process.env.PANEL_PASSWORD || process.env.PANEL_PASSWORD_HASH),
    hasPassword: !!process.env.PANEL_PASSWORD,
    hasHash: !!process.env.PANEL_PASSWORD_HASH,
  });
}
