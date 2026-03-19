import { NextResponse } from "next/server";
import { rm, stat } from "fs/promises";
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
    const body = await request.json().catch(() => ({}));
    const path = body.path || "";

    if (hasPathTraversal(path)) {
      return NextResponse.json({ error: "Invalid path" }, { status: 400 });
    }

    const absPath = resolvePath(path);
    if (!isWithinRoot(absPath)) {
      return NextResponse.json({ error: "Access denied" }, { status: 403 });
    }

    const st = await stat(absPath);
    if (st.isDirectory()) {
      await rm(absPath, { recursive: true });
    } else {
      await rm(absPath);
    }

    return NextResponse.json({ ok: true, message: "Deleted" });
  } catch (error: unknown) {
    const err = error as { code?: string };
    if (err.code === "ENOENT")
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    console.error("Files delete error:", error);
    return NextResponse.json(
      { error: "Failed to delete" },
      { status: 500 }
    );
  }
}
