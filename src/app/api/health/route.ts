import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";
export const revalidate = 0;

function isAllowedHost(url: URL): boolean {
  const host = url.hostname.toLowerCase();
  if (host === "localhost" || host === "127.0.0.1") return true;
  if (host.startsWith("192.168.") || host.startsWith("10.") || host.startsWith("172."))
    return true;
  return false;
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const rawUrl = searchParams.get("url");
  if (!rawUrl) {
    return NextResponse.json({ ok: false, error: "Missing url" }, { status: 400 });
  }
  try {
    const url = new URL(rawUrl);
    if (!isAllowedHost(url)) {
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
