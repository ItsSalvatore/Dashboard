import { NextResponse } from "next/server";
import si from "systeminformation";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET() {
  try {
    const [cpu, mem, disk, osInfo] = await Promise.all([
      si.currentLoad(),
      si.mem(),
      si.fsSize(),
      si.osInfo(),
    ]);
    const timeInfo = si.time();

    const mainDisk = disk.find((d) => d.mount === "/") ?? disk[0];

    return NextResponse.json({
      cpu: {
        current: Math.round(cpu.currentLoad),
        cores: cpu.cpus.length,
        user: Math.round(cpu.currentLoadUser),
        system: Math.round(cpu.currentLoadSystem),
      },
      memory: {
        total: mem.total,
        used: mem.used,
        free: mem.free,
        usedPercent: Math.round((mem.used / mem.total) * 100),
      },
      disk: mainDisk
        ? {
            total: mainDisk.size,
            used: mainDisk.used,
            free: mainDisk.available,
            usedPercent: Math.round((mainDisk.used / mainDisk.size) * 100),
            mount: mainDisk.mount,
          }
        : null,
      os: {
        platform: osInfo.platform,
        distro: osInfo.distro,
        hostname: osInfo.hostname,
        uptime: timeInfo.uptime,
      },
      timestamp: Date.now(),
    });
  } catch (error) {
    console.error("System API error:", error);
    return NextResponse.json(
      { error: "Failed to fetch system info" },
      { status: 500 }
    );
  }
}
