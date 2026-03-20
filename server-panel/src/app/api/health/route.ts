import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { isAllowedPrivateUrl } from "@/lib/network";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET(request: Request) {
  const { authorized } = await requireAuth();
  if (!authorized) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const rawUrl = searchParams.get("url");
  if (!rawUrl) {
    return NextResponse.json({ ok: false, error: "Missing url" }, { status: 400 });
  }
  try {
    const url = new URL(rawUrl);
    if (!isAllowedPrivateUrl(url)) {
      return NextResponse.json({ ok: false, error: "Host not allowed" }, { status: 403 });
    }
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 3000);
    const res = await fetch(url.toString(), {
      method: "HEAD",
      signal: controller.signal,
      redirect: "follow",
    });
    clearTimeout(timeout);
    return NextResponse.json({ ok: res.ok, status: res.status });
  } catch {
    return NextResponse.json({ ok: false });
  }
}
