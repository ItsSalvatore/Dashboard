import { NextResponse } from "next/server";
import { exec } from "child_process";
import { promisify } from "util";
import { requireAuth } from "@/lib/auth";

const execAsync = promisify(exec);

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
    const { stdout: statusOut } = await execAsync("ufw status verbose 2>/dev/null || true");
    const { stdout: numberedOut } = await execAsync("ufw status numbered 2>/dev/null || true");

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

  const body = await request.json().catch(() => ({}));
  const action = body.action;

  if (action === "enable") {
    await execAsync("ufw --force enable");
    return NextResponse.json({ ok: true, enabled: true });
  }
  if (action === "disable") {
    await execAsync("ufw --force disable");
    return NextResponse.json({ ok: true, enabled: false });
  }
  if (action === "add") {
    const rule = body.rule as string;
    if (!rule || typeof rule !== "string" || rule.length > 200) {
      return NextResponse.json({ error: "Invalid rule" }, { status: 400 });
    }
    if (/[;&|`$]/.test(rule)) {
      return NextResponse.json({ error: "Invalid characters in rule" }, { status: 400 });
    }
    await execAsync(`ufw ${rule}`);
    return NextResponse.json({ ok: true });
  }
  if (action === "delete") {
    const num = body.number;
    if (typeof num !== "number" || num < 1) {
      return NextResponse.json({ error: "Invalid rule number" }, { status: 400 });
    }
    await execAsync(`echo y | ufw delete ${num}`);
    return NextResponse.json({ ok: true });
  }

  return NextResponse.json({ error: "Invalid action" }, { status: 400 });
}
