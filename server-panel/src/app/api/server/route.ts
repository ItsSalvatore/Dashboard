import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { recordAuditEvent } from "@/lib/audit";
import { runCommand, runFirstSuccessful } from "@/lib/commands";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET() {
  const { authorized } = await requireAuth();
  if (!authorized) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const [hostname, uptime, kernel] = await Promise.all([
      runCommand("hostname").then((r) => r.stdout.trim()),
      runFirstSuccessful([
        { command: "uptime", args: ["-p"] },
        { command: "uptime" },
      ]).then((r) => r.stdout.trim()),
      runCommand("uname", ["-r"]).then((r) => r.stdout.trim()),
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
    const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
    const action = typeof body.action === "string" ? body.action : "";

    if (action === "reload-nginx") {
      await runCommand("nginx", ["-t"]);
      await runFirstSuccessful([
        { command: "systemctl", args: ["reload", "nginx"] },
        { command: "service", args: ["nginx", "reload"] },
      ]);
      await recordAuditEvent({
        timestamp: new Date().toISOString(),
        action: "server.reload-nginx",
        actor: "admin",
        outcome: "success",
      });
      return NextResponse.json({ ok: true, message: "nginx reloaded" });
    }

    if (action === "restart-nginx") {
      await runFirstSuccessful([
        { command: "systemctl", args: ["restart", "nginx"] },
        { command: "service", args: ["nginx", "restart"] },
      ]);
      await recordAuditEvent({
        timestamp: new Date().toISOString(),
        action: "server.restart-nginx",
        actor: "admin",
        outcome: "success",
      });
      return NextResponse.json({ ok: true, message: "nginx restarted" });
    }

    return NextResponse.json({ error: "Invalid action" }, { status: 400 });
  } catch (error: unknown) {
    const err = error as { stderr?: string };
    await recordAuditEvent({
      timestamp: new Date().toISOString(),
      action: "server.action",
      actor: "admin",
      outcome: "failure",
      details: { error: err.stderr ?? "Command failed" },
    });
    return NextResponse.json(
      { error: err.stderr ?? "Command failed" },
      { status: 500 }
    );
  }
}
