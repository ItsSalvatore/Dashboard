import { NextResponse } from "next/server";
import si from "systeminformation";
import { requireAuth } from "@/lib/auth";
import { runFirstSuccessful } from "@/lib/commands";

export const dynamic = "force-dynamic";
export const revalidate = 0;

type ListeningConnection = {
  protocol: string;
  localAddress: string;
  localPort: number;
  pid: number | null;
  process: string | null;
};

function groupPorts(listening: ListeningConnection[]) {
  const byPort = new Map<
    number,
    { protocol: string; address: string; pid: number | null; process: string | null }[]
  >();

  for (const conn of listening) {
    const key = conn.localPort;
    if (!byPort.has(key)) {
      byPort.set(key, []);
    }
    byPort.get(key)!.push({
      protocol: conn.protocol,
      address: conn.localAddress,
      pid: conn.pid ?? null,
      process: conn.process ?? null,
    });
  }

  return Array.from(byPort.entries())
    .map(([port, connections]) => {
      const unique = connections.reduce(
        (acc, connection) => {
          const uniqueKey = `${connection.protocol}-${connection.address}-${connection.pid}-${connection.process}`;
          if (!acc.has(uniqueKey)) {
            acc.set(uniqueKey, connection);
          }
          return acc;
        },
        new Map<string, (typeof connections)[0]>()
      );

      return {
        port,
        connections: Array.from(unique.values()),
      };
    })
    .sort((a, b) => a.port - b.port);
}

function parsePort(value: string) {
  const withoutBrackets = value.replace(/^\[|\]$/g, "");
  const match = withoutBrackets.match(/:(\d+)$/);
  return match ? Number.parseInt(match[1], 10) : NaN;
}

function parseAddress(value: string) {
  const normalized = value.replace(/^\[|\]$/g, "");
  const match = normalized.match(/^(.*):\d+$/);
  return match?.[1] || normalized;
}

function parseSsOutput(stdout: string): ListeningConnection[] {
  return stdout
    .split("\n")
    .slice(1)
    .map((line) => line.trim())
    .filter(Boolean)
    .flatMap((line) => {
      const parts = line.split(/\s+/);
      if (parts.length < 6) {
        return [];
      }

      const protocol = parts[0]?.toUpperCase() || "TCP";
      const state = parts[1]?.toUpperCase() || "";
      if (state !== "LISTEN" && state !== "UNCONN") {
        return [];
      }

      const local = parts[4];
      const processInfo = parts.slice(6).join(" ");
      const localPort = parsePort(local);
      if (!Number.isFinite(localPort) || localPort <= 0) {
        return [];
      }

      const pidMatch = processInfo.match(/pid=(\d+)/);
      const processMatch = processInfo.match(/"([^"]+)"/);

      return [
        {
          protocol,
          localAddress: parseAddress(local),
          localPort,
          pid: pidMatch ? Number.parseInt(pidMatch[1], 10) : null,
          process: processMatch?.[1] || null,
        },
      ];
    });
}

function parseNetstatOutput(stdout: string): ListeningConnection[] {
  return stdout
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.startsWith("tcp") || line.startsWith("udp"))
    .flatMap((line) => {
      const parts = line.split(/\s+/);
      const protocol = parts[0]?.toUpperCase() || "TCP";
      const local = parts[3];
      const stateOrPid = parts[5] ?? "";
      const pidField = parts.at(-1) ?? "";
      const state = protocol.startsWith("TCP") ? stateOrPid.toUpperCase() : "UNCONN";
      if (state !== "LISTEN" && state !== "UNCONN") {
        return [];
      }

      const localPort = parsePort(local);
      if (!Number.isFinite(localPort) || localPort <= 0) {
        return [];
      }

      const pidMatch = pidField.match(/^(\d+)\//);
      const processMatch = pidField.match(/^\d+\/(.+)$/);

      return [
        {
          protocol,
          localAddress: parseAddress(local),
          localPort,
          pid: pidMatch ? Number.parseInt(pidMatch[1], 10) : null,
          process: processMatch?.[1] || null,
        },
      ];
    });
}

export async function GET() {
  const { authorized } = await requireAuth();
  if (!authorized) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const warnings: string[] = [];
  try {
    const connections = await si.networkConnections();
    const listening = connections
      .filter((c) => c.state === "LISTEN")
      .map((c) => ({
        protocol: c.protocol?.toUpperCase() ?? "TCP",
        localAddress: c.localAddress || "0.0.0.0",
        localPort: typeof c.localPort === "string" ? parseInt(c.localPort, 10) : (c.localPort ?? 0),
        pid: c.pid,
        process: c.process ?? null,
      }))
      .filter((c) => !isNaN(c.localPort) && c.localPort > 0)
      .sort((a, b) => a.localPort - b.localPort);

    return NextResponse.json({
      ports: groupPorts(listening),
      total: listening.length,
      source: "systeminformation",
      degraded: false,
      warnings,
      timestamp: Date.now(),
    });
  } catch (error) {
    console.error("Ports API error:", error);
    warnings.push("Falling back to shell-based port discovery");
  }

  try {
    const ssResult = await runFirstSuccessful([
      { command: "ss", args: ["-tulpn"] },
      { command: "netstat", args: ["-tulpn"] },
    ]);
    const usedSource = ssResult.stdout.includes("Netid") ? "ss" : "netstat";
    const listening =
      usedSource === "ss"
        ? parseSsOutput(ssResult.stdout)
        : parseNetstatOutput(ssResult.stdout);

    return NextResponse.json({
      ports: groupPorts(listening),
      total: listening.length,
      source: usedSource,
      degraded: true,
      warnings,
      timestamp: Date.now(),
    });
  } catch (fallbackError) {
    console.error("Ports fallback error:", fallbackError);
    warnings.push("No supported port discovery command available");

    return NextResponse.json({
      ports: [],
      total: 0,
      source: "unavailable",
      degraded: true,
      warnings,
      timestamp: Date.now(),
    });
  }
}
