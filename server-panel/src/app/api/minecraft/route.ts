import { NextResponse } from "next/server";
import { exec } from "child_process";
import { promisify } from "util";
import { existsSync } from "fs";
import { join } from "path";
import { requireAuth } from "@/lib/auth";

const execAsync = promisify(exec);

export const dynamic = "force-dynamic";
export const revalidate = 0;

const MINECRAFT_PORT = 25565;

function getMinecraftPath(): string | null {
  const envPath = process.env.MINECRAFT_SERVER_PATH;
  if (envPath) return envPath;
  const defaults = [
    "/opt/minecraft",
    "/home/minecraft",
    join(process.env.HOME || "/root", "minecraft"),
  ];
  for (const p of defaults) {
    if (existsSync(p)) return p;
  }
  return null;
}

function getStartCommand(dir: string): string {
  const script = process.env.MINECRAFT_START_SCRIPT || "start.sh";
  const fullPath = join(dir, script);
  if (existsSync(fullPath)) return `bash ${fullPath}`;
  if (existsSync(join(dir, "run.sh"))) return `bash ${join(dir, "run.sh")}`;
  const jar = process.env.MINECRAFT_JAR || "server.jar";
  const jarPath = join(dir, jar);
  if (existsSync(jarPath)) return `java -Xmx2G -Xms1G -jar ${jarPath} nogui`;
  return "";
}

export async function GET() {
  const dir = getMinecraftPath();
  if (!dir) {
    return NextResponse.json({
      configured: false,
      running: false,
      message: "Set MINECRAFT_SERVER_PATH in .env.local to your server directory",
    });
  }

  try {
    const { stdout } = await execAsync(
      `lsof -i :${MINECRAFT_PORT} -t 2>/dev/null || netstat -tlnp 2>/dev/null | grep :${MINECRAFT_PORT} || ss -tlnp 2>/dev/null | grep :${MINECRAFT_PORT} || true`
    );
    const running = stdout.trim().length > 0;

    const startCommand = getStartCommand(dir);
    return NextResponse.json({
      configured: true,
      running,
      path: dir,
      port: MINECRAFT_PORT,
      startCommand: startCommand || null,
    });
  } catch {
    return NextResponse.json({
      configured: true,
      running: false,
      path: dir,
      port: MINECRAFT_PORT,
    });
  }
}

export async function POST(request: Request) {
  const { authorized } = await requireAuth();
  if (!authorized) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const dir = getMinecraftPath();
  if (!dir) {
    return NextResponse.json(
      { error: "Minecraft server not configured. Set MINECRAFT_SERVER_PATH." },
      { status: 400 }
    );
  }

  let action: string;
  try {
    const body = await request.json().catch(() => ({}));
    action = body.action || new URL(request.url).searchParams.get("action") || "";
  } catch {
    action = "";
  }

  const startCommand = getStartCommand(dir);
  if (!startCommand && action !== "stop") {
    return NextResponse.json(
      { error: "No start script or server.jar found in Minecraft directory" },
      { status: 400 }
    );
  }

  try {
    if (action === "start") {
      await execAsync(`cd ${dir} && nohup ${startCommand} > server.log 2>&1 &`, {
        shell: "/bin/bash",
      });
      return NextResponse.json({ ok: true, action: "started" });
    }

    if (action === "stop") {
      const { stdout } = await execAsync(`lsof -i :${MINECRAFT_PORT} -t 2>/dev/null`);
      const pids = stdout.trim().split("\n").filter(Boolean);
      for (const pid of pids) {
        await execAsync(`kill ${pid}`);
      }
      if (pids.length === 0) {
        return NextResponse.json({ ok: true, action: "stopped", message: "No process found" });
      }
      return NextResponse.json({ ok: true, action: "stopped" });
    }

    if (action === "restart") {
      const { stdout } = await execAsync(`lsof -i :${MINECRAFT_PORT} -t 2>/dev/null`);
      const pids = stdout.trim().split("\n").filter(Boolean);
      for (const pid of pids) {
        await execAsync(`kill ${pid}`);
      }
      await new Promise((r) => setTimeout(r, 2000));
      await execAsync(`cd ${dir} && nohup ${startCommand} > server.log 2>&1 &`, {
        shell: "/bin/bash",
      });
      return NextResponse.json({ ok: true, action: "restarted" });
    }

    return NextResponse.json({ error: "Invalid action" }, { status: 400 });
  } catch (error: unknown) {
    const err = error as { stderr?: string };
    return NextResponse.json(
      { error: err.stderr ?? "Command failed" },
      { status: 500 }
    );
  }
}
