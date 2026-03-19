import { NextResponse } from "next/server";
import si from "systeminformation";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const COMMON_APPS: { name: string; port: number; path?: string }[] = [
  { name: "Dashboard", port: 3000 },
  { name: "Next.js", port: 3000 },
  { name: "Vite", port: 5173 },
  { name: "nginx", port: 80 },
  { name: "Apache", port: 80 },
  { name: "HTTPS", port: 443 },
  { name: "Plex", port: 32400 },
  { name: "Jellyfin", port: 8096 },
  { name: "Home Assistant", port: 8123 },
  { name: "Portainer", port: 9000 },
  { name: "Grafana", port: 3000 },
  { name: "Prometheus", port: 9090 },
  { name: "Node-RED", port: 1880 },
  { name: "Pi-hole", port: 80 },
  { name: "Unifi", port: 8443 },
  { name: "Syncthing", port: 8384 },
  { name: "Transmission", port: 9091 },
  { name: "qBittorrent", port: 8080 },
  { name: "Radarr", port: 7878 },
  { name: "Sonarr", port: 8989 },
  { name: "SABnzbd", port: 8080 },
  { name: "Paperless", port: 8000 },
  { name: "Uptime Kuma", port: 3001 },
  { name: "Tailscale", port: 8080 },
];

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const baseUrl = searchParams.get("baseUrl") ?? "http://localhost";

  try {
    const connections = await si.networkConnections();
    const listening = connections.filter((c) => c.state === "LISTEN");

    const portSet = new Set(
      listening.map((c) =>
        typeof c.localPort === "string" ? parseInt(c.localPort, 10) : (c.localPort ?? 0)
      ).filter((p) => !isNaN(p) && p > 0)
    );
    const portToProcess = new Map(
      listening
        .filter((c) => c.pid && c.process)
        .map((c) => {
          const port = typeof c.localPort === "string" ? parseInt(c.localPort, 10) : (c.localPort ?? 0);
          return [port, { pid: c.pid!, process: c.process! }] as const;
        })
        .filter(([p]) => !isNaN(p) && p > 0)
    );

    const apps = COMMON_APPS.filter((a) => portSet.has(a.port)).map((app) => {
      const proc = portToProcess.get(app.port);
      return {
        name: app.name,
        port: app.port,
        url: `${baseUrl.replace(/\/$/, "")}:${app.port}`,
        status: "running" as const,
        process: proc?.process ?? null,
        pid: proc?.pid ?? null,
      };
    });

    const unknownPorts = Array.from(portSet)
      .filter((p) => !COMMON_APPS.some((a) => a.port === p))
      .filter((p) => p < 65536 && p > 0)
      .sort((a, b) => a - b)
      .map((port) => {
        const proc = portToProcess.get(port);
        return {
          name: proc?.process ?? `Port ${port}`,
          port,
          url: `${baseUrl.replace(/\/$/, "")}:${port}`,
          status: "running" as const,
          process: proc?.process ?? null,
          pid: proc?.pid ?? null,
        };
      });

    return NextResponse.json({
      known: apps,
      unknown: unknownPorts,
      all: [...apps, ...unknownPorts].sort((a, b) => a.port - b.port),
      timestamp: Date.now(),
    });
  } catch (error) {
    console.error("Websites API error:", error);
    return NextResponse.json(
      { error: "Failed to fetch hosted apps" },
      { status: 500 }
    );
  }
}
