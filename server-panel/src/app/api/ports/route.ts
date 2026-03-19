import { NextResponse } from "next/server";
import si from "systeminformation";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET() {
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

    const ports = Array.from(byPort.entries()).map(([port, conns]) => {
      const unique = conns.reduce(
        (acc, c) => {
          const k = `${c.protocol}-${c.pid}`;
          if (!acc.has(k)) acc.set(k, c);
          return acc;
        },
        new Map<string, (typeof conns)[0]>()
      );
      return {
        port,
        connections: Array.from(unique.values()),
      };
    });

    return NextResponse.json({
      ports,
      total: listening.length,
      timestamp: Date.now(),
    });
  } catch (error) {
    console.error("Ports API error:", error);
    return NextResponse.json(
      { error: "Failed to fetch port info" },
      { status: 500 }
    );
  }
}
