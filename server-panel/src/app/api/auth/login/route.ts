import { NextResponse } from "next/server";
import { verifyPassword } from "@/lib/auth";
import { createSessionToken, getCookieConfig } from "@/lib/auth";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const configured = !!(process.env.PANEL_PASSWORD?.trim() || process.env.PANEL_PASSWORD_HASH?.trim());
  if (!configured) {
    return NextResponse.json(
      { error: "Authentication not configured. Set PANEL_PASSWORD or PANEL_PASSWORD_HASH in .env.local (in server-panel folder), then restart." },
      { status: 503 }
    );
  }

  try {
    const body = await request.json();
    const password = body?.password;
    if (typeof password !== "string" || !password) {
      return NextResponse.json({ error: "Password required" }, { status: 400 });
    }

    const valid = await verifyPassword(password);
    if (!valid) {
      return NextResponse.json({ error: "Invalid password" }, { status: 401 });
    }

    const token = createSessionToken();
    const config = getCookieConfig();
    const res = NextResponse.json({ ok: true });
    res.cookies.set(config.name, token, {
      httpOnly: config.httpOnly,
      secure: config.secure,
      sameSite: config.sameSite,
      path: config.path,
      maxAge: config.maxAge,
    });
    return res;
  } catch {
    return NextResponse.json({ error: "Login failed" }, { status: 500 });
  }
}
