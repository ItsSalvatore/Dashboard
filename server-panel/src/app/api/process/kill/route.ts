import { NextResponse } from "next/server";
import { exec } from "child_process";
import { promisify } from "util";
import { requireAuth } from "@/lib/auth";

const execAsync = promisify(exec);

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

    await execAsync(`kill ${pidNum}`);
    return NextResponse.json({ ok: true, pid: pidNum });
  } catch (error: unknown) {
    const err = error as { stderr?: string; code?: number };
    return NextResponse.json(
      { error: err.stderr ?? "Failed to kill process" },
      { status: 500 }
    );
  }
}
