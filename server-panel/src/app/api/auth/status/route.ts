import { NextResponse } from "next/server";
import { isAuthConfigured } from "@/lib/auth-config";

export const dynamic = "force-dynamic";

export async function GET() {
  const configured = isAuthConfigured();

  return NextResponse.json({
    configured,
    setupRequired: !configured,
  });
}
