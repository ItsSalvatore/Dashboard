import { NextResponse } from "next/server";
import si from "systeminformation";
import { requireAuth } from "@/lib/auth";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET() {
  const { authorized } = await requireAuth();
  if (!authorized) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const [cpu, mem, disk, diskLayout, osInfo, graphics] = await Promise.all([
      si.currentLoad(),
      si.mem(),
      si.fsSize(),
      si.diskLayout().catch(() => []),
      si.osInfo(),
      si.graphics().catch(() => ({ controllers: [] })),
    ]);
    const timeInfo = si.time();

    const mainDisk = disk.find((d) => d.mount === "/") ?? disk[0];
    const gpu = (graphics as { controllers?: { model: string; vendor: string; vram: number; utilizationGpu?: number }[] }).controllers?.[0];

    // Use (total - available) / total for Linux-accurate memory (matches free/htop)
    const usedMem = mem.total - mem.available;
    const usedPercent = mem.total > 0 ? Math.round((usedMem / mem.total) * 100) : 0;
    const volumes = disk.map((entry) => ({
      mount: entry.mount,
      fs: entry.fs,
      type: entry.type || "volume",
      total: entry.size,
      used: entry.used,
      free: entry.available,
      usedPercent: entry.size > 0 ? Math.round((entry.used / entry.size) * 100) : 0,
    }));
    const storageDevices = (diskLayout as {
      device?: string;
      name?: string;
      type?: string;
      interfaceType?: string;
      size?: number;
    }[]).map((entry) => ({
      name: entry.name || entry.device || "Unknown device",
      type: entry.type || "Unknown",
      interface: entry.interfaceType || "Unknown",
      size: entry.size || 0,
    }));

    return NextResponse.json({
      cpu: {
        current: Math.round(cpu.currentLoad),
        cores: cpu.cpus.length,
        user: Math.round(cpu.currentLoadUser),
        system: Math.round(cpu.currentLoadSystem),
      },
      memory: {
        total: mem.total,
        used: usedMem,
        available: mem.available,
        usedPercent,
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
      gpu: gpu
        ? {
            model: gpu.model,
            vendor: gpu.vendor,
            vram: gpu.vram,
            utilizationGpu: gpu.utilizationGpu ?? null,
          }
        : null,
      os: {
        platform: osInfo.platform,
        distro: osInfo.distro,
        hostname: osInfo.hostname,
        uptime: timeInfo.uptime,
      },
      storage: {
        volumes,
        devices: storageDevices,
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
