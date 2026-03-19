import { NextResponse } from "next/server";
import { readdir, stat } from "fs/promises";
import { join } from "path";
import { requireAuth } from "@/lib/auth";
import { hasPathTraversal } from "@/lib/validation";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const FILE_MANAGER_ROOT = process.env.FILE_MANAGER_ROOT || "/var/www";

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
    if (!st.isDirectory()) {
      return NextResponse.json({ error: "Not a directory" }, { status: 400 });
    }

    const entries = await readdir(absPath, { withFileTypes: true });
    const items = await Promise.all(
      entries.map(async (e) => {
        const fullPath = join(absPath, e.name);
        const s = await stat(fullPath).catch(() => null);
        return {
          name: e.name,
          type: e.isDirectory() ? "dir" : "file",
          size: s?.isFile() ? s.size : null,
          mtime: s?.mtime ? s.mtime.toISOString() : null,
        };
      })
    );

    return NextResponse.json({
      path: path || "/",
      root: FILE_MANAGER_ROOT,
      items: items.sort((a, b) => {
        if (a.type !== b.type) return a.type === "dir" ? -1 : 1;
        return a.name.localeCompare(b.name, undefined, { sensitivity: "base" });
      }),
    });
  } catch (error: unknown) {
    const err = error as { code?: string };
    if (err.code === "ENOENT")
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    console.error("Files list error:", error);
    return NextResponse.json(
      { error: "Failed to list directory" },
      { status: 500 }
    );
  }
}
