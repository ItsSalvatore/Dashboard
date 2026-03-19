import { NextResponse } from "next/server";
import { readFile, stat } from "fs/promises";
import { join } from "path";
import { requireAuth } from "@/lib/auth";
import { hasPathTraversal } from "@/lib/validation";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const FILE_MANAGER_ROOT = process.env.FILE_MANAGER_ROOT || "/var/www";
const MAX_FILE_SIZE = 512 * 1024; // 512 KB for inline view

function resolvePath(relative: string): string {
  const clean = "/" + relative.replace(/\/+/g, "/").replace(/^\/+|\/+$/g, "");
  return join(FILE_MANAGER_ROOT, clean);
}

function isWithinRoot(absPath: string): boolean {
  const root = FILE_MANAGER_ROOT.replace(/\/$/, "") || "/";
  return absPath === root || absPath.startsWith(root + "/");
}

export async function GET(request: Request) {
  const { authorized } = await requireAuth();
  if (!authorized)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const { searchParams } = new URL(request.url);
    const path = searchParams.get("path") || "";

    if (hasPathTraversal(path)) {
      return NextResponse.json({ error: "Invalid path" }, { status: 400 });
    }

    const absPath = resolvePath(path);
    if (!isWithinRoot(absPath)) {
      return NextResponse.json({ error: "Access denied" }, { status: 403 });
    }

    const st = await stat(absPath);
    if (!st.isFile()) {
      return NextResponse.json({ error: "Not a file" }, { status: 400 });
    }

    if (st.size > MAX_FILE_SIZE) {
      return NextResponse.json(
        { error: `File too large (max ${MAX_FILE_SIZE / 1024} KB for preview)` },
        { status: 400 }
      );
    }

    const content = await readFile(absPath, "utf-8");
    return NextResponse.json({ content, path });
  } catch (error: unknown) {
    const err = error as { code?: string };
    if (err.code === "ENOENT")
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    return NextResponse.json(
      { error: "Failed to read file" },
      { status: 500 }
    );
  }
}
