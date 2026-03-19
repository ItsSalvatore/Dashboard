import { NextResponse } from "next/server";
import { readFile, writeFile, mkdir } from "fs/promises";
import { join } from "path";
import { requireAuth } from "@/lib/auth";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const NOTES_DIR = process.env.PANEL_DATA_DIR || process.env.BACKUP_DIR || "/var/backups/panel";
const NOTES_FILE = join(NOTES_DIR, "services-notes.txt");

export async function GET() {
  const { authorized } = await requireAuth();
  if (!authorized)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

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
    const body = await request.json().catch(() => ({}));
    const content = typeof body.content === "string" ? body.content : "";

    await mkdir(NOTES_DIR, { recursive: true });
    await writeFile(NOTES_FILE, content, "utf-8");

    return NextResponse.json({ ok: true, message: "Saved" });
  } catch (err) {
    console.error("Notes write error:", err);
    return NextResponse.json(
      { error: "Failed to save notes" },
      { status: 500 }
    );
  }
}
