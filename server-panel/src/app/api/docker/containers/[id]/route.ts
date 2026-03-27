import { NextResponse } from "next/server";
import { isValidContainerId } from "@/lib/validation";
import { requireAuth } from "@/lib/auth";
import { recordAuditEvent } from "@/lib/audit";
import { runCommand } from "@/lib/commands";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { authorized } = await requireAuth();
  if (!authorized) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;
  if (!isValidContainerId(id)) {
    return NextResponse.json({ error: "Invalid container ID" }, { status: 400 });
  }

  const body = await request.json().catch(() => ({}));
  const action = body.action;

  if (!["start", "stop", "restart"].includes(action)) {
    return NextResponse.json({ error: "Invalid action" }, { status: 400 });
  }

  try {
    await runCommand("docker", [action, id]);
    await recordAuditEvent({
      timestamp: new Date().toISOString(),
      action: `docker.${action}`,
      actor: "admin",
      outcome: "success",
      details: { containerId: id },
    });
    return NextResponse.json({ ok: true, action });
  } catch (error: unknown) {
    const err = error as { stderr?: string; stdout?: string; message?: string };
    await recordAuditEvent({
      timestamp: new Date().toISOString(),
      action: `docker.${action}`,
      actor: "admin",
      outcome: "failure",
      details: { containerId: id, reason: err.message || "docker_operation_failed" },
    });
    return NextResponse.json(
      { error: err.stderr || err.stdout || err.message || "Docker operation failed" },
      { status: 500 }
    );
  }
}
