import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { recordAuditEvent } from "@/lib/audit";
import {
  DEFAULT_PANEL_SETTINGS,
  type PanelSettings,
  readPanelJson,
  writePanelJson,
} from "@/lib/panel-data";

export const dynamic = "force-dynamic";
export const revalidate = 0;

function normalizeSettings(input: unknown): PanelSettings {
  const source = (input ?? {}) as Partial<PanelSettings>;
  const dashboard: Partial<PanelSettings["dashboard"]> = source.dashboard ?? {};
  const defaults: Partial<PanelSettings["defaults"]> = source.defaults ?? {};
  const security: Partial<PanelSettings["security"]> = source.security ?? {};

  const pollingIntervalMs =
    typeof dashboard.pollingIntervalMs === "number"
      ? dashboard.pollingIntervalMs
      : DEFAULT_PANEL_SETTINGS.dashboard.pollingIntervalMs;

  return {
    dashboard: {
      pollingIntervalMs: Math.min(Math.max(pollingIntervalMs, 2000), 15000),
      showGpu:
        typeof dashboard.showGpu === "boolean"
          ? dashboard.showGpu
          : DEFAULT_PANEL_SETTINGS.dashboard.showGpu,
      showProcessTable:
        typeof dashboard.showProcessTable === "boolean"
          ? dashboard.showProcessTable
          : DEFAULT_PANEL_SETTINGS.dashboard.showProcessTable,
      compactMode:
        typeof dashboard.compactMode === "boolean"
          ? dashboard.compactMode
          : DEFAULT_PANEL_SETTINGS.dashboard.compactMode,
    },
    defaults: {
      webserver: defaults.webserver === "ols" ? "ols" : "nginx",
      backupDirectoryLabel:
        typeof defaults.backupDirectoryLabel === "string" && defaults.backupDirectoryLabel.trim()
          ? defaults.backupDirectoryLabel.trim()
          : DEFAULT_PANEL_SETTINGS.defaults.backupDirectoryLabel,
      fileManagerRootLabel:
        typeof defaults.fileManagerRootLabel === "string" && defaults.fileManagerRootLabel.trim()
          ? defaults.fileManagerRootLabel.trim()
          : DEFAULT_PANEL_SETTINGS.defaults.fileManagerRootLabel,
    },
    security: {
      sshPort:
        typeof security.sshPort === "string" && security.sshPort.trim()
          ? security.sshPort.trim()
          : DEFAULT_PANEL_SETTINGS.security.sshPort,
      fail2banEnabled:
        typeof security.fail2banEnabled === "boolean"
          ? security.fail2banEnabled
          : DEFAULT_PANEL_SETTINGS.security.fail2banEnabled,
    },
  };
}

export async function GET() {
  const { authorized } = await requireAuth();
  if (!authorized) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const settings = normalizeSettings(await readPanelJson("settings.json", DEFAULT_PANEL_SETTINGS));
    return NextResponse.json(settings);
  } catch (error) {
    console.error("Settings read error:", error);
    return NextResponse.json({ error: "Failed to read settings" }, { status: 500 });
  }
}

export async function POST(request: Request) {
  const { authorized } = await requireAuth();
  if (!authorized) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = await request.json().catch(() => ({}));
    const settings = normalizeSettings(body);
    await writePanelJson("settings.json", settings);
    await recordAuditEvent({
      timestamp: new Date().toISOString(),
      action: "settings.update",
      actor: "admin",
      outcome: "success",
      details: {
        pollingIntervalMs: settings.dashboard.pollingIntervalMs,
        showGpu: settings.dashboard.showGpu,
        showProcessTable: settings.dashboard.showProcessTable,
        compactMode: settings.dashboard.compactMode,
      },
    });
    return NextResponse.json({ ok: true, settings });
  } catch (error) {
    console.error("Settings write error:", error);
    return NextResponse.json({ error: "Failed to save settings" }, { status: 500 });
  }
}
