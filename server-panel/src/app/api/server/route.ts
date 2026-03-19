import { NextResponse } from "next/server";
import { exec } from "child_process";
import { promisify } from "util";
import { requireAuth } from "@/lib/auth";

const execAsync = promisify(exec);

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET() {
  try {
    const [hostname, uptime, kernel] = await Promise.all([
      execAsync("hostname").then((r) => r.stdout.trim()),
      execAsync("uptime -p 2>/dev/null || uptime").then((r) => r.stdout.trim()),
      execAsync("uname -r").then((r) => r.stdout.trim()),
    ]);

    return NextResponse.json({
      hostname,
      uptime,
      kernel,
    });
  } catch (error) {
    console.error("Server info error:", error);
    return NextResponse.json(
      { error: "Failed to get server info" },
      { status: 500 }
    );
  }
}

export async function POST(request: Request) {
  const { authorized } = await requireAuth();
  if (!authorized) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try {
    const body = await request.json().catch(() => ({}));
    const action = body.action;

    if (action === "reload-nginx") {
      await execAsync("nginx -t && systemctl reload nginx 2>/dev/null || service nginx reload 2>/dev/null");
      return NextResponse.json({ ok: true, message: "nginx reloaded" });
    }

    if (action === "restart-nginx") {
      await execAsync("systemctl restart nginx 2>/dev/null || service nginx restart 2>/dev/null");
      return NextResponse.json({ ok: true, message: "nginx restarted" });
    }

    return NextResponse.json({ error: "Invalid action" }, { status: 400 });
  } catch (error: unknown) {
    const err = error as { stderr?: string };
    return NextResponse.json(
      { error: err.stderr ?? "Command failed" },
      { status: 500 }
    );
  }
}
