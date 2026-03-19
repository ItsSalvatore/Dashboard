import { NextResponse } from "next/server";
import { writeFile, mkdir, stat } from "fs/promises";
import { join, dirname } from "path";
import { requireAuth } from "@/lib/auth";
import { hasPathTraversal } from "@/lib/validation";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const FILE_MANAGER_ROOT = process.env.FILE_MANAGER_ROOT || "/var/www";
const MAX_UPLOAD_SIZE = 50 * 1024 * 1024; // 50 MB

function resolvePath(relative: string): string {
  const clean = "/" + relative.replace(/\/+/g, "/").replace(/^\/+|\/+$/g, "");
  return join(FILE_MANAGER_ROOT, clean);
}

function isWithinRoot(absPath: string): boolean {
  const root = FILE_MANAGER_ROOT.replace(/\/$/, "") || "/";
  return absPath === root || absPath.startsWith(root + "/");
}

export async function POST(request: Request) {
  const { authorized } = await requireAuth();
  if (!authorized)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const formData = await request.formData();
    const path = (formData.get("path") as string) || "";
    const file = formData.get("file") as File | null;

    if (!file || !(file instanceof File)) {
      return NextResponse.json({ error: "No file provided" }, { status: 400 });
    }

    const filename = file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
    if (!filename) {
      return NextResponse.json({ error: "Invalid filename" }, { status: 400 });
    }

    if (hasPathTraversal(path) || hasPathTraversal(filename)) {
      return NextResponse.json({ error: "Invalid path" }, { status: 400 });
    }

    const absPath = resolvePath(path);
    if (!isWithinRoot(absPath)) {
      return NextResponse.json({ error: "Access denied" }, { status: 403 });
    }

    const st = await stat(absPath);
    if (!st.isDirectory()) {
      return NextResponse.json({ error: "Path is not a directory" }, { status: 400 });
    }

    const destPath = join(absPath, filename);
    if (!isWithinRoot(destPath)) {
      return NextResponse.json({ error: "Access denied" }, { status: 403 });
    }

    if (file.size > MAX_UPLOAD_SIZE) {
      return NextResponse.json(
        { error: `File too large (max ${MAX_UPLOAD_SIZE / 1024 / 1024} MB)` },
        { status: 400 }
      );
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    await mkdir(dirname(destPath), { recursive: true });
    await writeFile(destPath, buffer);

    return NextResponse.json({ ok: true, message: "Uploaded", filename });
  } catch (error: unknown) {
    console.error("Files upload error:", error);
    return NextResponse.json(
      { error: "Failed to upload" },
      { status: 500 }
    );
  }
}
