import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { readRecentAuditEvents } from "@/lib/audit";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET(request: Request) {
  const { authorized } = await requireAuth();
  if (!authorized) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const { searchParams } = new URL(request.url);
    const limitParam = Number(searchParams.get("limit") || "50");
    const limit = Math.min(Math.max(limitParam, 1), 200);
    const entries = await readRecentAuditEvents(limit);
    return NextResponse.json({ entries });
  } catch (error) {
    console.error("Audit read error:", error);
    return NextResponse.json({ error: "Failed to read audit log" }, { status: 500 });
  }
}
