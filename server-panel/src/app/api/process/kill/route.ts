import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { recordAuditEvent } from "@/lib/audit";
import { runCommand } from "@/lib/commands";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function POST(request: Request) {
  const { authorized } = await requireAuth();
  if (!authorized) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try {
    const body = await request.json();
    const pid = body?.pid;

    if (pid == null || typeof pid !== "number") {
      return NextResponse.json({ error: "Missing or invalid pid" }, { status: 400 });
    }

    const pidNum = Math.floor(pid);
    if (pidNum < 1 || pidNum > 2147483647) {
      return NextResponse.json({ error: "Invalid pid range" }, { status: 400 });
    }

    await runCommand("kill", [String(pidNum)]);
    await recordAuditEvent({
      timestamp: new Date().toISOString(),
      action: "process.kill",
      actor: "admin",
      outcome: "success",
      details: { pid: pidNum },
    });
    return NextResponse.json({ ok: true, pid: pidNum });
  } catch (error: unknown) {
    const err = error as { stderr?: string; stdout?: string; code?: number; message?: string };
    await recordAuditEvent({
      timestamp: new Date().toISOString(),
      action: "process.kill",
      actor: "admin",
      outcome: "failure",
      details: { reason: err.message || "kill_failed" },
    });
    return NextResponse.json(
      { error: err.stderr || err.stdout || err.message || "Failed to kill process" },
      { status: 500 }
    );
  }
}
