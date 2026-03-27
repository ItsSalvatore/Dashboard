import { NextResponse } from "next/server";
import si from "systeminformation";
import { requireAuth } from "@/lib/auth";
import { runCommand } from "@/lib/commands";

export const dynamic = "force-dynamic";
export const revalidate = 0;

type ProcessInfo = {
  pid: number;
  name: string;
  cpu: number;
  mem: number;
  memRss: number;
  state: string;
  user: string;
  command: string;
};

function sortProcesses(processes: ProcessInfo[], sort: string) {
  return [...processes].sort((a, b) => {
    if (sort === "cpu") return (b.cpu ?? 0) - (a.cpu ?? 0);
    if (sort === "mem") return (b.mem ?? 0) - (a.mem ?? 0);
    if (sort === "name") return (a.name ?? "").localeCompare(b.name ?? "");
    return 0;
  });
}

function parsePsOutput(stdout: string): ProcessInfo[] {
  return stdout
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .flatMap((line) => {
      const match = line.match(/^(\d+)\s+(\S+)\s+([\d.]+)\s+(\d+)\s+(\S+)\s+(\S+)\s+(.*)$/);
      if (!match) {
        return [];
      }

      const pid = Number.parseInt(match[1], 10);
      const cpu = Math.round(Number.parseFloat(match[3]) || 0);
      const memRss = Number.parseInt(match[4], 10) * 1024;

      return [
        {
          pid,
          name: match[2],
          cpu,
          mem: Math.round((memRss / 1024 / 1024) * 10) / 10,
          memRss,
          state: match[5],
          user: match[6],
          command: match[7].slice(0, 120),
        },
      ];
    });
}

export async function GET(request: Request) {
  const { authorized } = await requireAuth();
  if (!authorized) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const limit = Math.min(parseInt(searchParams.get("limit") ?? "50", 10), 200);
  const sort = searchParams.get("sort") ?? "cpu";
  const warnings: string[] = [];

  try {
    const { list } = await si.processes();
    const processes = sortProcesses(
      list
      .map((p) => ({
        pid: p.pid,
        name: p.name,
        cpu: Math.round(p.cpu),
        mem: Math.round((p.memRss / 1024 / 1024) * 10) / 10,
        memRss: p.memRss,
        state: p.state,
        user: p.user,
        command: p.command?.slice(0, 80),
      }))
      ,
      sort
    )
      .slice(0, limit);

    return NextResponse.json({
      processes,
      total: list.length,
      source: "systeminformation",
      degraded: false,
      warnings,
      timestamp: Date.now(),
    });
  } catch (error) {
    console.error("Processes API error:", error);
    warnings.push("Falling back to ps-based process discovery");
  }

  try {
    const { stdout } = await runCommand("ps", [
      "-eo",
      "pid=,comm=,%cpu=,rss=,state=,user=,args=",
      "--no-headers",
    ]);
    const list = parsePsOutput(stdout);
    const processes = sortProcesses(list, sort).slice(0, limit);

    return NextResponse.json({
      processes,
      total: list.length,
      source: "ps",
      degraded: true,
      warnings,
      timestamp: Date.now(),
    });
  } catch (fallbackError) {
    console.error("Processes fallback error:", fallbackError);
    warnings.push("No supported process discovery command available");

    return NextResponse.json({
      processes: [],
      total: 0,
      source: "unavailable",
      degraded: true,
      warnings,
      timestamp: Date.now(),
    });
  }
}
