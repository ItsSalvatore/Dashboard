import { NextResponse } from "next/server";
import { readFile, writeFile } from "fs/promises";
import { join } from "path";
import { requireAuth } from "@/lib/auth";
import { recordAuditEvent } from "@/lib/audit";
import { getPanelDataDir } from "@/lib/panel-data";

export const dynamic = "force-dynamic";
export const revalidate = 0;

async function getNotesFile() {
  return join(await getPanelDataDir(), "services-notes.txt");
}

export async function GET() {
  const { authorized } = await requireAuth();
  if (!authorized)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const NOTES_FILE = await getNotesFile();
  try {
    const content = await readFile(NOTES_FILE, "utf-8");
    return NextResponse.json({ content, path: NOTES_FILE });
  } catch (err: unknown) {
    const e = err as { code?: string };
    if (e.code === "ENOENT") {
      return NextResponse.json({ content: "", path: NOTES_FILE });
    }
    console.error("Notes read error:", err);
    return NextResponse.json(
      { error: "Failed to read notes" },
      { status: 500 }
    );
  }
}

export async function POST(request: Request) {
  const { authorized } = await requireAuth();
  if (!authorized)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const NOTES_FILE = await getNotesFile();
    const body = await request.json().catch(() => ({}));
    const content = typeof body.content === "string" ? body.content : "";

    await writeFile(NOTES_FILE, content, "utf-8");
    await recordAuditEvent({
      timestamp: new Date().toISOString(),
      action: "notes.update",
      actor: "admin",
      outcome: "success",
      details: { characters: content.length },
    });

    return NextResponse.json({ ok: true, message: "Saved" });
  } catch (err) {
    console.error("Notes write error:", err);
    return NextResponse.json(
      { error: "Failed to save notes" },
      { status: 500 }
    );
  }
}
