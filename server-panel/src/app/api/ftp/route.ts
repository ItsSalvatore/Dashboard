import { NextResponse } from "next/server";
import { exec } from "child_process";
import { promisify } from "util";
import { writeFile, unlink } from "fs/promises";
import { randomBytes } from "crypto";
import { join } from "path";
import { requireAuth } from "@/lib/auth";

const execAsync = promisify(exec);

export const dynamic = "force-dynamic";
export const revalidate = 0;

const PASSWD_FILE = "/etc/passwd";
const VSFTPD_CONF = "/etc/vsftpd.conf";
const VSFTPD_USERLIST = "/etc/vsftpd.userlist";

export async function GET() {
  const { authorized } = await requireAuth();
  if (!authorized) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const { stdout } = await execAsync(
      "getent passwd | awk -F: '$3 >= 1000 && $3 < 65534 && $7 !~ /nologin|false/ {print $1\":\"$6}' 2>/dev/null || cat /etc/passwd | awk -F: '$3 >= 1000 && $3 < 65534 {print $1\":\"$6}'"
    );
    const users = stdout
      .trim()
      .split("\n")
      .filter(Boolean)
      .map((line) => {
        const [name, home] = line.split(":");
        return { name, home: home || "" };
      });

    const vsftpdInstalled = await execAsync("which vsftpd 2>/dev/null").then(() => true).catch(() => false);

    return NextResponse.json({
      users,
      vsftpdInstalled,
    });
  } catch {
    return NextResponse.json({ users: [], vsftpdInstalled: false });
  }
}

export async function POST(request: Request) {
  const { authorized } = await requireAuth();
  if (!authorized) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await request.json().catch(() => ({}));
  const action = body.action;

  if (action === "create-user") {
    const username = String(body.username ?? "").replace(/[^a-z0-9_-]/gi, "");
    const password = body.password;
    const home = body.home ? String(body.home).replace(/\.\./g, "") : `/home/${username}`;

    if (!username || username.length < 2 || username.length > 32) {
      return NextResponse.json({ error: "Invalid username" }, { status: 400 });
    }
    if (!password || password.length < 6) {
      return NextResponse.json({ error: "Password must be at least 6 characters" }, { status: 400 });
    }

    try {
      await execAsync(`useradd -m -d ${home} -s /bin/bash ${username}`);
      const tmpFile = join("/tmp", `chpasswd-${randomBytes(8).toString("hex")}`);
      await writeFile(tmpFile, `${username}:${password}\n`);
      await execAsync(`chpasswd < ${tmpFile}`);
      await unlink(tmpFile).catch(() => {});
      await execAsync(`chown ${username}:${username} ${home}`);
      await execAsync(`usermod -aG sftp-users ${username}`).catch(() => {});
      await execAsync(`echo "${username}" >> ${VSFTPD_USERLIST}`).catch(() => {});
      return NextResponse.json({ ok: true, username });
    } catch (err: unknown) {
      const e = err as { stderr?: string };
      return NextResponse.json({ error: e.stderr ?? "Failed to create user" }, { status: 500 });
    }
  }

  if (action === "delete-user") {
    const username = String(body.username ?? "").replace(/[^a-z0-9_-]/gi, "");
    if (!username) return NextResponse.json({ error: "Invalid username" }, { status: 400 });
    try {
      await execAsync(`userdel -r ${username}`);
      return NextResponse.json({ ok: true });
    } catch (err: unknown) {
      const e = err as { stderr?: string };
      return NextResponse.json({ error: e.stderr ?? "Failed to delete user" }, { status: 500 });
    }
  }

  return NextResponse.json({ error: "Invalid action" }, { status: 400 });
}
