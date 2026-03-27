import { NextResponse } from "next/server";
import { spawn } from "child_process";
import { closeSync, existsSync, openSync } from "fs";
import { join } from "path";
import { requireAuth } from "@/lib/auth";
import { recordAuditEvent } from "@/lib/audit";
import { runCommand } from "@/lib/commands";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const MINECRAFT_PORT = 25565;

type StartCommand = {
  command: string;
  args: string[];
};

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

function getStartCommand(dir: string): StartCommand | null {
  const script = process.env.MINECRAFT_START_SCRIPT || "start.sh";
  const fullPath = join(dir, script);
  if (existsSync(fullPath)) return { command: "bash", args: [fullPath] };
  if (existsSync(join(dir, "run.sh"))) return { command: "bash", args: [join(dir, "run.sh")] };
  const jar = process.env.MINECRAFT_JAR || "server.jar";
  const jarPath = join(dir, jar);
  if (existsSync(jarPath)) {
    return {
      command: "java",
      args: ["-Xmx2G", "-Xms1G", "-jar", jarPath, "nogui"],
    };
  }
  return null;
}

function formatStartCommand(command: StartCommand | null): string | null {
  if (!command) {
    return null;
  }

  return [command.command, ...command.args].join(" ");
}

async function getMinecraftPids(): Promise<string[]> {
  try {
    const { stdout } = await runCommand("lsof", ["-i", `:${MINECRAFT_PORT}`, "-t"]);
    return stdout.trim().split("\n").filter(Boolean);
  } catch {
    // Fall back to other platform tools.
  }

  try {
    const { stdout } = await runCommand("ss", ["-tlnp"]);
    return stdout
      .split("\n")
      .filter((line) => line.includes(`:${MINECRAFT_PORT}`))
      .flatMap((line) => Array.from(line.matchAll(/pid=(\d+)/g)).map((match) => match[1]));
  } catch {
    // Fall back to netstat.
  }

  try {
    const { stdout } = await runCommand("netstat", ["-tlnp"]);
    return stdout
      .split("\n")
      .filter((line) => line.includes(`:${MINECRAFT_PORT}`))
      .flatMap((line) => Array.from(line.matchAll(/\s(\d+)\/[^\s]+/g)).map((match) => match[1]));
  } catch {
    return [];
  }
}

async function startMinecraftServer(dir: string, startCommand: StartCommand) {
  return new Promise<void>((resolve, reject) => {
    const logFd = openSync(join(dir, "server.log"), "a");
    const child = spawn(startCommand.command, startCommand.args, {
      cwd: dir,
      detached: true,
      stdio: ["ignore", logFd, logFd],
    });

    child.once("error", (error) => {
      closeSync(logFd);
      reject(error);
    });

    child.once("spawn", () => {
      closeSync(logFd);
      child.unref();
      resolve();
    });
  });
}

export async function GET() {
  const { authorized } = await requireAuth();
  if (!authorized) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const dir = getMinecraftPath();
  if (!dir) {
    return NextResponse.json({
      configured: false,
      running: false,
      message: "Set MINECRAFT_SERVER_PATH in .env.local to your server directory",
    });
  }

  try {
    const running = (await getMinecraftPids()).length > 0;

    const startCommand = getStartCommand(dir);
    return NextResponse.json({
      configured: true,
      running,
      path: dir,
      port: MINECRAFT_PORT,
      startCommand: formatStartCommand(startCommand),
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
    const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
    action =
      (typeof body.action === "string" ? body.action : "") ||
      new URL(request.url).searchParams.get("action") ||
      "";
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
      await startMinecraftServer(dir, startCommand!);
      await recordAuditEvent({
        timestamp: new Date().toISOString(),
        action: "minecraft.start",
        actor: "admin",
        outcome: "success",
      });
      return NextResponse.json({ ok: true, action: "started" });
    }

    if (action === "stop") {
      const pids = await getMinecraftPids();
      for (const pid of pids) {
        await runCommand("kill", [pid]);
      }
      await recordAuditEvent({
        timestamp: new Date().toISOString(),
        action: "minecraft.stop",
        actor: "admin",
        outcome: "success",
        details: { stopped: pids.length },
      });
      if (pids.length === 0) {
        return NextResponse.json({ ok: true, action: "stopped", message: "No process found" });
      }
      return NextResponse.json({ ok: true, action: "stopped" });
    }

    if (action === "restart") {
      const pids = await getMinecraftPids();
      for (const pid of pids) {
        await runCommand("kill", [pid]);
      }
      await new Promise((r) => setTimeout(r, 2000));
      await startMinecraftServer(dir, startCommand!);
      await recordAuditEvent({
        timestamp: new Date().toISOString(),
        action: "minecraft.restart",
        actor: "admin",
        outcome: "success",
        details: { stopped: pids.length },
      });
      return NextResponse.json({ ok: true, action: "restarted" });
    }

    return NextResponse.json({ error: "Invalid action" }, { status: 400 });
  } catch (error: unknown) {
    const err = error as { stderr?: string; stdout?: string; message?: string };
    await recordAuditEvent({
      timestamp: new Date().toISOString(),
      action: `minecraft.${action || "unknown"}`,
      actor: "admin",
      outcome: "failure",
      details: { reason: err.message || "command_failed" },
    });
    return NextResponse.json(
      { error: err.stderr || err.stdout || err.message || "Command failed" },
      { status: 500 }
    );
  }
}
