import { NextResponse } from "next/server";
import { mkdir, stat } from "fs/promises";
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

export async function POST(request: Request) {
  const { authorized } = await requireAuth();
  if (!authorized)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
    const path = typeof body.path === "string" ? body.path : "";
    const name = (typeof body.name === "string" ? body.name : "").trim().replace(/\/+/g, "");

    if (!name || hasPathTraversal(path) || hasPathTraversal(name)) {
      return NextResponse.json({ error: "Invalid path or name" }, { status: 400 });
    }

    const parentPath = resolvePath(path);
    if (!isWithinRoot(parentPath)) {
      return NextResponse.json({ error: "Access denied" }, { status: 403 });
    }

    const st = await stat(parentPath);
    if (!st.isDirectory()) {
      return NextResponse.json({ error: "Parent is not a directory" }, { status: 400 });
    }

    const newDirPath = join(parentPath, name);
    if (!isWithinRoot(newDirPath)) {
      return NextResponse.json({ error: "Access denied" }, { status: 403 });
    }

    await mkdir(newDirPath, { recursive: true });
    return NextResponse.json({ ok: true, message: "Created", path: newDirPath });
  } catch (error: unknown) {
    const err = error as { code?: string };
    if (err.code === "EEXIST")
      return NextResponse.json({ error: "Directory already exists" }, { status: 400 });
    console.error("Files mkdir error:", error);
    return NextResponse.json(
      { error: "Failed to create directory" },
      { status: 500 }
    );
  }
}
