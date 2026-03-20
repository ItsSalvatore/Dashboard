import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { recordAuditEvent } from "@/lib/audit";
import { runCommand, runFirstSuccessful } from "@/lib/commands";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const ACTIONS = {
  "docker-summary": {
    label: "Docker summary",
    description: "List container state, image, and published ports",
    run: async () =>
      runCommand("docker", [
        "ps",
        "-a",
        "--format",
        "table {{.Names}}\t{{.Status}}\t{{.Image}}\t{{.Ports}}",
      ]),
  },
  "disk-usage": {
    label: "Disk usage",
    description: "Show mounted filesystems and capacity",
    run: async () => runCommand("df", ["-h"]),
  },
  "memory-summary": {
    label: "Memory summary",
    description: "Show RAM and swap usage",
    run: async () =>
      runFirstSuccessful([
        { command: "free", args: ["-h"] },
        { command: "vm_stat" },
      ]),
  },
  "nginx-status": {
    label: "nginx status",
    description: "Inspect nginx service state",
    run: async () =>
      runFirstSuccessful([
        { command: "systemctl", args: ["status", "nginx", "--no-pager", "--lines=20"] },
        { command: "service", args: ["nginx", "status"] },
      ]),
  },
  "listening-ports": {
    label: "Listening ports",
    description: "Show currently listening network ports",
    run: async () => {
      const result = await runCommand("ss", ["-tulpn"]);
      return {
        stdout: result.stdout.split("\n").slice(0, 40).join("\n"),
        stderr: result.stderr,
      };
    },
  },
} as const;

type ActionId = keyof typeof ACTIONS;

export async function GET() {
  const { authorized } = await requireAuth();
  if (!authorized) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  return NextResponse.json({
    actions: Object.entries(ACTIONS).map(([id, action]) => ({
      id,
      label: action.label,
      description: action.description,
    })),
  });
}

export async function POST(request: Request) {
  const { authorized } = await requireAuth();
  if (!authorized) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = await request.json().catch(() => ({}));
    const action = typeof body.action === "string" ? (body.action as ActionId) : null;

    if (!action || !(action in ACTIONS)) {
      return NextResponse.json({ error: "Invalid action" }, { status: 400 });
    }

    const selected = ACTIONS[action];
    const result = await selected.run();

    const output = [result.stdout, result.stderr].filter(Boolean).join("\n").trim();

    await recordAuditEvent({
      timestamp: new Date().toISOString(),
      action: `ops.${action}`,
      actor: "admin",
      outcome: "success",
      details: { label: selected.label },
    });

    return NextResponse.json({
      ok: true,
      action,
      label: selected.label,
      output: output || "Command completed with no output.",
    });
  } catch (error) {
    const err = error as { stdout?: string; stderr?: string; message?: string };
    await recordAuditEvent({
      timestamp: new Date().toISOString(),
      action: "ops.command",
      actor: "admin",
      outcome: "failure",
      details: { reason: err.message || "command_failed" },
    });

    return NextResponse.json(
      {
        error: (err.stderr || err.stdout || err.message || "Command failed").trim(),
      },
      { status: 500 }
    );
  }
}
