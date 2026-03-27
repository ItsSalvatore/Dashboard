import { hostname as getHostname, uptime as getUptime } from "node:os";
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

  const warnings: string[] = [];
  const [cpuResult, memResult, diskResult, diskLayoutResult, osInfoResult, graphicsResult] =
    await Promise.allSettled([
      si.currentLoad(),
      si.mem(),
      si.fsSize(),
      si.diskLayout(),
      si.osInfo(),
      si.graphics(),
    ]);

  const cpu = cpuResult.status === "fulfilled" ? cpuResult.value : null;
  if (!cpu) warnings.push("CPU telemetry unavailable");

  const mem = memResult.status === "fulfilled" ? memResult.value : null;
  if (!mem) warnings.push("Memory telemetry unavailable");

  const disk = diskResult.status === "fulfilled" ? diskResult.value : [];
  if (diskResult.status !== "fulfilled") warnings.push("Disk usage unavailable");

  const diskLayout = diskLayoutResult.status === "fulfilled" ? diskLayoutResult.value : [];
  if (diskLayoutResult.status !== "fulfilled") warnings.push("Disk device inventory unavailable");

  const osInfo = osInfoResult.status === "fulfilled" ? osInfoResult.value : null;
  if (!osInfo) warnings.push("OS metadata unavailable");

  const graphics =
    graphicsResult.status === "fulfilled" ? graphicsResult.value : { controllers: [] };
  if (graphicsResult.status !== "fulfilled") warnings.push("GPU telemetry unavailable");

  const timeInfo = si.time();
  const mainDisk = disk.find((entry) => entry.mount === "/") ?? disk[0];
  const gpu = (
    graphics as {
      controllers?: {
        model: string;
        vendor: string;
        vram: number;
        utilizationGpu?: number;
      }[];
    }
  ).controllers?.[0];

  const usedMem = mem ? mem.total - mem.available : 0;
  const usedPercent = mem && mem.total > 0 ? Math.round((usedMem / mem.total) * 100) : 0;
  const volumes = disk.map((entry) => ({
    mount: entry.mount,
    fs: entry.fs,
    type: entry.type || "volume",
    total: entry.size,
    used: entry.used,
    free: entry.available,
    usedPercent: entry.size > 0 ? Math.round((entry.used / entry.size) * 100) : 0,
  }));
  const storageDevices = (
    diskLayout as {
      device?: string;
      name?: string;
      type?: string;
      interfaceType?: string;
      size?: number;
    }[]
  ).map((entry) => ({
    name: entry.name || entry.device || "Unknown device",
    type: entry.type || "Unknown",
    interface: entry.interfaceType || "Unknown",
    size: entry.size || 0,
  }));

  return NextResponse.json({
    cpu: cpu
      ? {
          current: Math.round(cpu.currentLoad),
          cores: cpu.cpus.length,
          user: Math.round(cpu.currentLoadUser),
          system: Math.round(cpu.currentLoadSystem),
        }
      : null,
    memory: mem
      ? {
          total: mem.total,
          used: usedMem,
          available: mem.available,
          usedPercent,
        }
      : null,
    disk: mainDisk
      ? {
          total: mainDisk.size,
          used: mainDisk.used,
          free: mainDisk.available,
          usedPercent: mainDisk.size > 0 ? Math.round((mainDisk.used / mainDisk.size) * 100) : 0,
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
      platform: osInfo?.platform || process.platform,
      distro: osInfo?.distro || "Unknown",
      hostname: osInfo?.hostname || getHostname(),
      uptime: timeInfo.uptime || getUptime(),
    },
    storage: {
      volumes,
      devices: storageDevices,
    },
    degraded: warnings.length > 0,
    warnings,
    timestamp: Date.now(),
  });
}
