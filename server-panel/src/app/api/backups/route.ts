import { NextResponse } from "next/server";
import { readdir, stat } from "fs/promises";
import { existsSync } from "fs";
import { join } from "path";
import { requireAuth } from "@/lib/auth";
import { recordAuditEvent } from "@/lib/audit";
import { runCommand } from "@/lib/commands";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const BACKUP_DIR = process.env.BACKUP_DIR || "/var/backups/panel";

export async function GET() {
  const { authorized } = await requireAuth();
  if (!authorized) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    if (!existsSync(BACKUP_DIR)) {
      return NextResponse.json({ backups: [], backupDir: BACKUP_DIR });
    }
    const files = await readdir(BACKUP_DIR);
    const backups = await Promise.all(
      files
        .filter((f) => f.endsWith(".tar.gz") || f.endsWith(".tar"))
        .map(async (f) => {
          const s = await stat(join(BACKUP_DIR, f));
          return { name: f, size: s.size, mtime: s.mtime.toISOString() };
        })
    );
    backups.sort((a, b) => new Date(b.mtime).getTime() - new Date(a.mtime).getTime());

    return NextResponse.json({ backups, backupDir: BACKUP_DIR });
  } catch {
    return NextResponse.json({ backups: [] });
  }
}

export async function POST(request: Request) {
  const { authorized } = await requireAuth();
  if (!authorized) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
  const action = typeof body.action === "string" ? body.action : "";

  if (action === "create") {
    const webRoot = process.env.WEB_ROOT || "/var/www";
    const site = (typeof body.site === "string" ? body.site : "")
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9.-]/g, "");
    const timestamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
    const filename = site
      ? `backup-${site}-${timestamp}.tar.gz`
      : `backup-${timestamp}.tar.gz`;
    const filepath = join(BACKUP_DIR, filename);

    try {
      await runCommand("mkdir", ["-p", BACKUP_DIR]);
      const backupPaths = site
        ? [join(webRoot, site).replace(/^\//, "")]
        : [webRoot.replace(/^\//, ""), "etc/nginx"];
      await runCommand("tar", ["-czf", filepath, "-C", "/", ...backupPaths]);
      await recordAuditEvent({
        timestamp: new Date().toISOString(),
        action: "backup.create",
        actor: "admin",
        outcome: "success",
        details: { filename, site: site || "all" },
      });
      return NextResponse.json({ ok: true, filename, site: site || null });
    } catch (err: unknown) {
      const e = err as { stderr?: string; stdout?: string; message?: string };
      await recordAuditEvent({
        timestamp: new Date().toISOString(),
        action: "backup.create",
        actor: "admin",
        outcome: "failure",
        details: { reason: e.message || "backup_failed", site: site || "all" },
      });
      return NextResponse.json(
        { error: e.stderr || e.stdout || e.message || "Backup failed" },
        { status: 500 }
      );
    }
  }

  if (action === "restore") {
    const filename = typeof body.filename === "string" ? body.filename : "";
    if (!filename || !/^backup[-a-z0-9.T]+\.tar\.gz$/.test(filename) || filename.includes("..")) {
      return NextResponse.json({ error: "Invalid filename" }, { status: 400 });
    }
    const filepath = join(BACKUP_DIR, filename);
    if (!existsSync(filepath)) {
      return NextResponse.json({ error: "Backup not found" }, { status: 404 });
    }
    try {
      await runCommand("tar", ["-xzf", filepath, "-C", "/"]);
      await recordAuditEvent({
        timestamp: new Date().toISOString(),
        action: "backup.restore",
        actor: "admin",
        outcome: "success",
        details: { filename },
      });
      return NextResponse.json({ ok: true });
    } catch (err: unknown) {
      const e = err as { stderr?: string; stdout?: string; message?: string };
      await recordAuditEvent({
        timestamp: new Date().toISOString(),
        action: "backup.restore",
        actor: "admin",
        outcome: "failure",
        details: { filename, reason: e.message || "restore_failed" },
      });
      return NextResponse.json(
        { error: e.stderr || e.stdout || e.message || "Restore failed" },
        { status: 500 }
      );
    }
  }

  if (action === "delete") {
    const filename = typeof body.filename === "string" ? body.filename : "";
    if (!filename || !filename.endsWith(".tar.gz") || filename.includes("..")) {
      return NextResponse.json({ error: "Invalid filename" }, { status: 400 });
    }
    const filepath = join(BACKUP_DIR, filename);
    if (!filepath.startsWith(BACKUP_DIR)) {
      return NextResponse.json({ error: "Invalid path" }, { status: 400 });
    }
    try {
      await runCommand("rm", ["-f", filepath]);
      await recordAuditEvent({
        timestamp: new Date().toISOString(),
        action: "backup.delete",
        actor: "admin",
        outcome: "success",
        details: { filename },
      });
      return NextResponse.json({ ok: true });
    } catch (error: unknown) {
      const err = error as { stderr?: string; stdout?: string; message?: string };
      await recordAuditEvent({
        timestamp: new Date().toISOString(),
        action: "backup.delete",
        actor: "admin",
        outcome: "failure",
        details: { filename, reason: err.message || "delete_failed" },
      });
      return NextResponse.json(
        { error: err.stderr || err.stdout || err.message || "Delete failed" },
        { status: 500 }
      );
    }
  }

  return NextResponse.json({ error: "Invalid action" }, { status: 400 });
}
