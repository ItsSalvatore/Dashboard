import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { recordAuditEvent } from "@/lib/audit";
import { isAllowedPrivateUrl } from "@/lib/network";
import {
  DEFAULT_INTEGRATIONS,
  type IntegrationRecord,
  readPanelJson,
  writePanelJson,
} from "@/lib/panel-data";

export const dynamic = "force-dynamic";
export const revalidate = 0;

type IntegrationStatus = "healthy" | "offline" | "disabled";

function normalizeIntegration(input: unknown, fallback: IntegrationRecord): IntegrationRecord {
  const source = (input ?? {}) as Partial<IntegrationRecord>;

  return {
    id: typeof source.id === "string" && source.id.trim() ? source.id.trim() : fallback.id,
    name: typeof source.name === "string" && source.name.trim() ? source.name.trim() : fallback.name,
    description:
      typeof source.description === "string" && source.description.trim()
        ? source.description.trim()
        : fallback.description,
    icon: typeof source.icon === "string" && source.icon.trim() ? source.icon.trim().slice(0, 3) : fallback.icon,
    enabled: typeof source.enabled === "boolean" ? source.enabled : fallback.enabled,
    url: typeof source.url === "string" ? source.url.trim() : fallback.url,
    healthUrl: typeof source.healthUrl === "string" ? source.healthUrl.trim() : fallback.healthUrl,
    port: typeof source.port === "string" ? source.port.trim() : fallback.port,
    category:
      source.category === "media" ||
      source.category === "files" ||
      source.category === "monitoring" ||
      source.category === "ops" ||
      source.category === "custom"
        ? source.category
        : fallback.category,
  };
}

async function readIntegrations() {
  const stored = await readPanelJson<IntegrationRecord[]>("integrations.json", DEFAULT_INTEGRATIONS);
  const merged = DEFAULT_INTEGRATIONS.map((item) => {
    const match = stored.find((storedItem) => storedItem.id === item.id);
    return normalizeIntegration(match, item);
  });

  const customStored = stored.filter(
    (item) => !DEFAULT_INTEGRATIONS.some((defaultItem) => defaultItem.id === item.id)
  );

  return [...merged, ...customStored.map((item) => normalizeIntegration(item, DEFAULT_INTEGRATIONS[4]))];
}

async function getIntegrationStatus(url: string, enabled: boolean): Promise<IntegrationStatus> {
  if (!enabled || !url) {
    return "disabled";
  }

  try {
    const target = new URL(url);
    if (!isAllowedPrivateUrl(target)) {
      return "offline";
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 2500);
    const response = await fetch(target.toString(), {
      method: "HEAD",
      redirect: "follow",
      signal: controller.signal,
    });
    clearTimeout(timeout);

    return response.ok ? "healthy" : "offline";
  } catch {
    return "offline";
  }
}

export async function GET() {
  const { authorized } = await requireAuth();
  if (!authorized) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const integrations = await readIntegrations();
    const enriched = await Promise.all(
      integrations.map(async (integration) => ({
        ...integration,
        status: await getIntegrationStatus(integration.healthUrl || integration.url, integration.enabled),
      }))
    );

    return NextResponse.json({ integrations: enriched });
  } catch (error) {
    console.error("Integrations read error:", error);
    return NextResponse.json({ error: "Failed to load integrations" }, { status: 500 });
  }
}

export async function POST(request: Request) {
  const { authorized } = await requireAuth();
  if (!authorized) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = await request.json().catch(() => ({}));
    const integrations = Array.isArray(body.integrations) ? body.integrations : [];
    const fallbackMap = new Map(DEFAULT_INTEGRATIONS.map((item) => [item.id, item]));
    const normalized = integrations.map((item) =>
      normalizeIntegration(item, fallbackMap.get((item as { id?: string })?.id || "") || DEFAULT_INTEGRATIONS[4])
    );

    await writePanelJson("integrations.json", normalized);
    await recordAuditEvent({
      timestamp: new Date().toISOString(),
      action: "integrations.update",
      actor: "admin",
      outcome: "success",
      details: {
        total: normalized.length,
        enabled: normalized.filter((item) => item.enabled).length,
      },
    });
    return NextResponse.json({ ok: true, integrations: normalized });
  } catch (error) {
    console.error("Integrations write error:", error);
    return NextResponse.json({ error: "Failed to save integrations" }, { status: 500 });
  }
}
