import { NextResponse } from "next/server";
import { exec } from "child_process";
import { promisify } from "util";
import { isValidContainerId } from "@/lib/validation";
import { requireAuth } from "@/lib/auth";

const execAsync = promisify(exec);

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
    await execAsync(`docker ${action} ${id}`);
    return NextResponse.json({ ok: true, action });
  } catch (error: unknown) {
    const err = error as { stderr?: string };
    return NextResponse.json(
      { error: err.stderr ?? "Docker operation failed" },
      { status: 500 }
    );
  }
}
