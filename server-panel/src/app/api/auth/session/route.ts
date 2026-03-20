import { NextResponse } from "next/server";
import { getAuthState } from "@/lib/auth";

export const dynamic = "force-dynamic";

export async function GET() {
  const authState = await getAuthState();
  return NextResponse.json({
    ...authState,
    setupRequired: !authState.configured,
  });
}
