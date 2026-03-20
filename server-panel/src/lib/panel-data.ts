import { mkdir, readFile, writeFile } from "fs/promises";
import { join } from "path";

export type PanelSettings = {
  dashboard: {
    pollingIntervalMs: number;
    showGpu: boolean;
    showProcessTable: boolean;
    compactMode: boolean;
  };
  defaults: {
    webserver: "nginx" | "ols";
    backupDirectoryLabel: string;
    fileManagerRootLabel: string;
  };
  security: {
    sshPort: string;
    fail2banEnabled: boolean;
  };
};

export type IntegrationRecord = {
  id: string;
  name: string;
  description: string;
  icon: string;
  enabled: boolean;
  url: string;
  healthUrl: string;
  port: string;
  category: "media" | "files" | "monitoring" | "ops" | "custom";
};

export const DEFAULT_PANEL_SETTINGS: PanelSettings = {
  dashboard: {
    pollingIntervalMs: 3000,
    showGpu: true,
    showProcessTable: true,
    compactMode: false,
  },
  defaults: {
    webserver: "nginx",
    backupDirectoryLabel: process.env.BACKUP_DIR || "/var/backups/panel",
    fileManagerRootLabel: process.env.FILE_MANAGER_ROOT || "/var/www",
  },
  security: {
    sshPort: process.env.SSH_PORT || "22",
    fail2banEnabled: false,
  },
};

export const DEFAULT_INTEGRATIONS: IntegrationRecord[] = [
  {
    id: "immich",
    name: "Immich",
    description: "Photo and video management",
    icon: "IM",
    enabled: false,
    url: "http://localhost:2283",
    healthUrl: "http://localhost:2283",
    port: "2283",
    category: "media",
  },
  {
    id: "nextcloud",
    name: "Nextcloud",
    description: "File sync and collaboration",
    icon: "NC",
    enabled: false,
    url: "http://localhost:8080",
    healthUrl: "http://localhost:8080/status.php",
    port: "8080",
    category: "files",
  },
  {
    id: "grafana",
    name: "Grafana",
    description: "Dashboards and observability",
    icon: "GR",
    enabled: false,
    url: "http://localhost:3000",
    healthUrl: "http://localhost:3000/api/health",
    port: "3000",
    category: "monitoring",
  },
  {
    id: "portainer",
    name: "Portainer",
    description: "Container operations",
    icon: "PT",
    enabled: false,
    url: "http://localhost:9000",
    healthUrl: "http://localhost:9000",
    port: "9000",
    category: "ops",
  },
  {
    id: "custom",
    name: "Custom Integration",
    description: "Point the panel at any self-hosted app",
    icon: "CU",
    enabled: false,
    url: "",
    healthUrl: "",
    port: "",
    category: "custom",
  },
];

function resolvePanelDataDir() {
  return process.env.PANEL_DATA_DIR || join(process.cwd(), ".panel-data");
}

async function ensurePanelDataDir() {
  const dir = resolvePanelDataDir();
  await mkdir(dir, { recursive: true });
  return dir;
}

export async function readPanelJson<T>(filename: string, fallback: T): Promise<T> {
  const dir = await ensurePanelDataDir();
  const filePath = join(dir, filename);

  try {
    const raw = await readFile(filePath, "utf-8");
    return JSON.parse(raw) as T;
  } catch (error) {
    const code = (error as { code?: string }).code;
    if (code === "ENOENT") {
      return fallback;
    }
    throw error;
  }
}

export async function writePanelJson<T>(filename: string, value: T) {
  const dir = await ensurePanelDataDir();
  const filePath = join(dir, filename);
  await writeFile(filePath, JSON.stringify(value, null, 2), "utf-8");
  return filePath;
}

export async function getPanelDataDir() {
  return ensurePanelDataDir();
}
