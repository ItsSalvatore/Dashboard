import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { recordAuditEvent } from "@/lib/audit";
import { runCommand } from "@/lib/commands";

export const dynamic = "force-dynamic";
export const revalidate = 0;

function parseRule(line: string): { num: number; raw: string; action?: string } | null {
  const m = line.match(/^\[?\s*(\d+)\]\s*(.+)/);
  if (!m) return null;
  const num = parseInt(m[1], 10);
  const rest = m[2];
  const actionMatch = rest.match(/(allow|deny|reject)/);
  return {
    num,
    raw: line.trim(),
    action: actionMatch?.[1],
  };
}

export async function GET() {
  const { authorized } = await requireAuth();
  if (!authorized) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const { stdout: statusOut } = await runCommand("ufw", ["status", "verbose"]);
    const { stdout: numberedOut } = await runCommand("ufw", ["status", "numbered"]);

    const enabled = statusOut.includes("Status: active");
    const rules: { num: number; raw: string; action?: string }[] = [];
    for (const line of numberedOut.split("\n")) {
      const r = parseRule(line);
      if (r) rules.push(r);
    }

    return NextResponse.json({
      enabled,
      rules,
      raw: numberedOut,
    });
  } catch {
    return NextResponse.json({
      enabled: false,
      rules: [],
      message: "ufw not found or not accessible",
    });
  }
}

export async function POST(request: Request) {
  const { authorized } = await requireAuth();
  if (!authorized) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
  const action = typeof body.action === "string" ? body.action : "";

  if (action === "enable") {
    await runCommand("ufw", ["--force", "enable"]);
    await recordAuditEvent({
      timestamp: new Date().toISOString(),
      action: "firewall.enable",
      actor: "admin",
      outcome: "success",
    });
    return NextResponse.json({ ok: true, enabled: true });
  }
  if (action === "disable") {
    await runCommand("ufw", ["--force", "disable"]);
    await recordAuditEvent({
      timestamp: new Date().toISOString(),
      action: "firewall.disable",
      actor: "admin",
      outcome: "success",
    });
    return NextResponse.json({ ok: true, enabled: false });
  }
  if (action === "add") {
    const rule = typeof body.rule === "string" ? body.rule : "";
    if (!rule || typeof rule !== "string" || rule.length > 200) {
      return NextResponse.json({ error: "Invalid rule" }, { status: 400 });
    }
    if (/[;&|`$]/.test(rule)) {
      return NextResponse.json({ error: "Invalid characters in rule" }, { status: 400 });
    }
    await runCommand("ufw", rule.trim().split(/\s+/));
    await recordAuditEvent({
      timestamp: new Date().toISOString(),
      action: "firewall.add",
      actor: "admin",
      outcome: "success",
      details: { rule },
    });
    return NextResponse.json({ ok: true });
  }
  if (action === "delete") {
    const num = typeof body.number === "number" ? body.number : null;
    if (typeof num !== "number" || num < 1) {
      return NextResponse.json({ error: "Invalid rule number" }, { status: 400 });
    }
    await runCommand("ufw", ["--force", "delete", String(num)]);
    await recordAuditEvent({
      timestamp: new Date().toISOString(),
      action: "firewall.delete",
      actor: "admin",
      outcome: "success",
      details: { number: num },
    });
    return NextResponse.json({ ok: true });
  }

  return NextResponse.json({ error: "Invalid action" }, { status: 400 });
}
