"use client";

import { useEffect, useState, useCallback } from "react";
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
} from "recharts";
import AppCard from "./AppCard";

type SystemData = {
  cpu: { current: number; cores: number };
  memory: { usedPercent: number; used: number; total: number };
  disk: { usedPercent: number; used: number; total: number; mount: string } | null;
  gpu: { model: string; vram: number; utilizationGpu: number | null } | null;
  os: { hostname: string; uptime: number; platform: string };
  storage: {
    volumes: {
      mount: string;
      fs: string;
      type: string;
      total: number;
      used: number;
      free: number;
      usedPercent: number;
    }[];
    devices: {
      name: string;
      type: string;
      interface: string;
      size: number;
    }[];
  };
} | null;

type Process = {
  pid: number;
  name: string;
  cpu: number;
  mem: number;
  user: string;
};

type PortInfo = {
  port: number;
  connections: { protocol: string; pid: number | null; process: string | null }[];
};

type AppInfo = {
  name: string;
  port: number;
  url: string;
  status: string;
  process: string | null;
  pid: number | null;
};

type Integration = {
  id: string;
  name: string;
  description: string;
  icon: string;
  enabled: boolean;
  url: string;
  healthUrl: string;
  port: string;
  category: "media" | "files" | "monitoring" | "ops" | "custom";
  status: "healthy" | "offline" | "disabled";
};

type SafeAction = {
  id: string;
  label: string;
  description: string;
};

type AuditEntry = {
  timestamp: string;
  action: string;
  actor: string;
  outcome: "success" | "failure";
  details?: Record<string, string | number | boolean | null>;
};

type PanelSettings = {
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

type TwoFactorState = {
  enabled: boolean;
  issuer: string;
  label: string;
  setupPending: boolean;
};

type Tab =
  | "overview"
  | "apps"
  | "docker"
  | "websites"
  | "firewall"
  | "dns"
  | "ftp"
  | "backups"
  | "minecraft"
  | "ssl"
  | "server"
  | "installs"
  | "files"
  | "notes"
  | "integrations"
  | "settings"
  | "actions"
  | "audit";

type OverviewSectionKey =
  | "metrics"
  | "actions"
  | "trends"
  | "storage"
  | "resources"
  | "processes";

type DockerContainer = {
  id: string;
  shortId: string;
  name: string;
  image: string;
  state: string;
  status: string;
  ports: string[];
};

type Website = { domain: string; configPath: string; root: string };

const DEFAULT_POLL_INTERVAL = 3000;

function cx(...classes: Array<string | false | null | undefined>) {
  return classes.filter(Boolean).join(" ");
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
  return `${(bytes / 1024 / 1024 / 1024).toFixed(1)} GB`;
}

function formatUptime(seconds: number): string {
  const d = Math.floor(seconds / 86400);
  const h = Math.floor((seconds % 86400) / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  if (d > 0) return `${d}d ${h}h`;
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m`;
}

function MetricCard({
  label,
  value,
  meta,
  toneClass,
}: {
  label: string;
  value: string;
  meta: string;
  toneClass: string;
}) {
  return (
    <div className="rounded-2xl border border-[var(--border)] bg-[var(--card)]/95 p-4 shadow-[0_0_0_1px_rgba(255,255,255,0.02)]">
      <p className="text-[11px] font-medium uppercase tracking-[0.2em] text-[var(--muted)]">
        {label}
      </p>
      <p className={cx("mt-3 text-3xl font-semibold tracking-tight", toneClass)}>{value}</p>
      <p className="mt-2 text-sm text-[var(--muted)]">{meta}</p>
    </div>
  );
}

function QuickActionCard({
  title,
  description,
  meta,
  onClick,
}: {
  title: string;
  description: string;
  meta: string;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className="group rounded-2xl border border-[var(--border)] bg-[var(--card)] p-5 text-left transition hover:border-[var(--accent)]/40 hover:bg-[var(--card)]/80"
    >
      <div className="flex items-center justify-between gap-3">
        <h3 className="text-base font-semibold text-[var(--foreground)]">{title}</h3>
        <span className="rounded-full border border-[var(--border)] px-2 py-0.5 text-[11px] uppercase tracking-[0.18em] text-[var(--muted)] transition group-hover:border-[var(--accent)]/30 group-hover:text-[var(--accent)]">
          Open
        </span>
      </div>
      <p className="mt-3 text-sm leading-6 text-[var(--muted)]">{description}</p>
      <p className="mt-4 text-xs text-[var(--accent)]">{meta}</p>
    </button>
  );
}

function CollapsibleSection({
  title,
  description,
  defaultOpen = true,
  open,
  onToggle,
  children,
}: {
  title: string;
  description?: string;
  defaultOpen?: boolean;
  open?: boolean;
  onToggle?: () => void;
  children: React.ReactNode;
}) {
  const controlled = typeof open === "boolean" && typeof onToggle === "function";

  if (!controlled) {
    return (
      <details
        open={defaultOpen}
        className="rounded-2xl border border-[var(--border)] bg-[var(--card)] p-5"
      >
        <summary className="flex cursor-pointer list-none items-center justify-between gap-3">
          <div>
            <h2 className="text-base font-semibold">{title}</h2>
            {description && <p className="mt-1 text-sm text-[var(--muted)]">{description}</p>}
          </div>
          <span className="text-xs text-[var(--muted)]">Toggle</span>
        </summary>
        <div className="mt-4">{children}</div>
      </details>
    );
  }

  return (
    <section className="rounded-2xl border border-[var(--border)] bg-[var(--card)] p-5">
      <button
        onClick={onToggle}
        className="flex w-full items-center justify-between gap-3 text-left"
      >
        <div>
          <h2 className="text-base font-semibold">{title}</h2>
          {description && <p className="mt-1 text-sm text-[var(--muted)]">{description}</p>}
        </div>
        <span className="text-xs text-[var(--muted)]">{open ? "Hide" : "Show"}</span>
      </button>
      {open && <div className="mt-4">{children}</div>}
    </section>
  );
}

export default function Dashboard() {
  const [system, setSystem] = useState<SystemData>(null);
  const [processes, setProcesses] = useState<Process[]>([]);
  const [ports, setPorts] = useState<PortInfo[]>([]);
  const [apps, setApps] = useState<AppInfo[]>([]);
  const [minecraft, setMinecraft] = useState<{
    configured: boolean;
    running: boolean;
    path?: string;
    port?: number;
  } | null>(null);
  const [ssl, setSsl] = useState<{ certs: { domain: string; expiry: string }[]; certbotInstalled: boolean } | null>(null);
  const [serverInfo, setServerInfo] = useState<{ hostname: string; uptime: string; kernel: string } | null>(null);
  const [cpuHistory, setCpuHistory] = useState<{ time: string; cpu: number }[]>([]);
  const [memHistory, setMemHistory] = useState<{ time: string; mem: number }[]>([]);
  const [sortBy, setSortBy] = useState<"cpu" | "mem" | "name">("cpu");
  const [baseUrl, setBaseUrl] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<Tab>("overview");
  const [killingPid, setKillingPid] = useState<number | null>(null);
  const [mcAction, setMcAction] = useState<string | null>(null);
  const [sslRenewing, setSslRenewing] = useState(false);
  const [dockerContainers, setDockerContainers] = useState<DockerContainer[]>([]);
  const [dockerAvailable, setDockerAvailable] = useState(false);
  const [websites, setWebsites] = useState<Website[]>([]);
  const [newDomain, setNewDomain] = useState("");
  const [newWordpress, setNewWordpress] = useState(false);
  const [creatingSite, setCreatingSite] = useState(false);
  const [containerAction, setContainerAction] = useState<string | null>(null);
  const [newWebserver, setNewWebserver] = useState<"nginx" | "ols">("nginx");
  const [firewall, setFirewall] = useState<{ enabled: boolean; rules: { num: number; raw: string }[] } | null>(null);
  const [dnsZones, setDnsZones] = useState<{ name: string; records: string[] }[]>([]);
  const [ftpUsers, setFtpUsers] = useState<{ name: string; home: string }[]>([]);
  const [backups, setBackups] = useState<{ name: string; size: number; mtime: string }[]>([]);
  const [newFtpUser, setNewFtpUser] = useState({ username: "", password: "" });
  const [newDnsZone, setNewDnsZone] = useState("");
  const [newDnsRecord, setNewDnsRecord] = useState({ zone: "", name: "@", type: "A", value: "" });
  const [firewallRule, setFirewallRule] = useState("");
  const [backupCreating, setBackupCreating] = useState(false);
  const [installStatus, setInstallStatus] = useState<{
    docker: { installed: boolean; name: string };
    nginx: { installed: boolean; name: string };
    certbot: { installed: boolean; name: string };
  } | null>(null);
  const [installing, setInstalling] = useState<string | null>(null);
  const [fileManagerPath, setFileManagerPath] = useState("");
  const [fileManagerItems, setFileManagerItems] = useState<{ name: string; type: string; size: number | null; mtime: string | null }[]>([]);
  const [filePreview, setFilePreview] = useState<{ path: string; content: string } | null>(null);
  const [fileManagerLoading, setFileManagerLoading] = useState(false);
  const [newDirName, setNewDirName] = useState("");
  const [uploadingFile, setUploadingFile] = useState(false);
  const [servicesNotes, setServicesNotes] = useState("");
  const [notesSaving, setNotesSaving] = useState(false);
  const [notesLastSaved, setNotesLastSaved] = useState<string | null>(null);
  const [selectedWebsite, setSelectedWebsite] = useState<string | null>(null);
  const [websiteDetail, setWebsiteDetail] = useState<{
    domain: string;
    root: string;
    exists: boolean;
    hasNginxConfig: boolean;
    hasDnsZone: boolean;
    sslCert: { domain: string; expiry: string } | null;
  } | null>(null);
  const [newCreateDnsZone, setNewCreateDnsZone] = useState(false);
  const [newCreateSsl, setNewCreateSsl] = useState(false);
  const [websiteDetailAction, setWebsiteDetailAction] = useState<string | null>(null);
  const [panelSettings, setPanelSettings] = useState<PanelSettings | null>(null);
  const [settingsSaving, setSettingsSaving] = useState(false);
  const [twoFactorState, setTwoFactorState] = useState<TwoFactorState | null>(null);
  const [twoFactorLoading, setTwoFactorLoading] = useState(false);
  const [twoFactorSetupSecret, setTwoFactorSetupSecret] = useState("");
  const [twoFactorOtpAuthUri, setTwoFactorOtpAuthUri] = useState("");
  const [twoFactorForm, setTwoFactorForm] = useState({
    password: "",
    code: "",
    issuer: "Server Panel",
    label: "admin",
  });
  const [integrations, setIntegrations] = useState<Integration[]>([]);
  const [integrationsSaving, setIntegrationsSaving] = useState(false);
  const [safeActions, setSafeActions] = useState<SafeAction[]>([]);
  const [actionRunning, setActionRunning] = useState<string | null>(null);
  const [actionOutput, setActionOutput] = useState<{ label: string; output: string } | null>(null);
  const [auditEntries, setAuditEntries] = useState<AuditEntry[]>([]);
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const [isMobileViewport, setIsMobileViewport] = useState(false);
  const [overviewSections, setOverviewSections] = useState<Record<OverviewSectionKey, boolean>>({
    metrics: true,
    actions: true,
    trends: false,
    storage: false,
    resources: true,
    processes: false,
  });

  const fetchSystem = useCallback(async () => {
    try {
      const res = await fetch("/api/system");
      if (!res.ok) throw new Error("System fetch failed");
      const data = await res.json();
      setSystem(data);
      const now = new Date().toLocaleTimeString("en-US", { hour12: false });
      setCpuHistory((prev) =>
        [...prev.slice(-59), { time: now, cpu: data.cpu.current }].slice(-60)
      );
      setMemHistory((prev) =>
        [...prev.slice(-59), { time: now, mem: data.memory.usedPercent }].slice(-60)
      );
    } catch (e) {
      setError("Failed to load system stats");
    }
  }, []);

  const fetchProcesses = useCallback(async () => {
    try {
      const res = await fetch(`/api/processes?sort=${sortBy}&limit=30`);
      if (!res.ok) throw new Error("Processes fetch failed");
      const data = await res.json();
      setProcesses(data.processes);
    } catch {
      setError("Failed to load processes");
    }
  }, [sortBy]);

  const fetchPorts = useCallback(async () => {
    try {
      const res = await fetch("/api/ports");
      if (!res.ok) throw new Error("Ports fetch failed");
      const data = await res.json();
      setPorts(data.ports);
    } catch {
      setError("Failed to load ports");
    }
  }, []);

  const fetchApps = useCallback(async () => {
    try {
      const url =
        baseUrl ||
        (typeof window !== "undefined"
          ? `${window.location.protocol}//${window.location.hostname}`
          : "http://localhost");
      const res = await fetch(`/api/websites?baseUrl=${encodeURIComponent(url)}`);
      if (!res.ok) throw new Error("Apps fetch failed");
      const data = await res.json();
      setApps(data.all);
    } catch {
      setError("Failed to load hosted apps");
    }
  }, [baseUrl]);

  const fetchMinecraft = useCallback(async () => {
    try {
      const res = await fetch("/api/minecraft");
      if (res.ok) setMinecraft(await res.json());
    } catch {
      setMinecraft({ configured: false, running: false });
    }
  }, []);

  const fetchSsl = useCallback(async () => {
    try {
      const res = await fetch("/api/ssl");
      if (res.ok) setSsl(await res.json());
    } catch {
      setSsl(null);
    }
  }, []);

  const fetchServer = useCallback(async () => {
    try {
      const res = await fetch("/api/server");
      if (res.ok) setServerInfo(await res.json());
    } catch {
      setServerInfo(null);
    }
  }, []);

  const fetchDocker = useCallback(async () => {
    try {
      const res = await fetch("/api/docker/containers");
      if (res.ok) {
        const data = await res.json();
        setDockerContainers(data.containers ?? []);
        setDockerAvailable(data.available ?? false);
      }
    } catch {
      setDockerContainers([]);
      setDockerAvailable(false);
    }
  }, []);

  const fetchWebsites = useCallback(async () => {
    try {
      const res = await fetch("/api/websites/list");
      if (res.ok) {
        const data = await res.json();
        setWebsites(data.sites ?? []);
      }
    } catch {
      setWebsites([]);
    }
  }, []);

  const fetchFirewall = useCallback(async () => {
    try {
      const res = await fetch("/api/firewall");
      if (res.ok) setFirewall(await res.json());
    } catch {
      setFirewall(null);
    }
  }, []);

  const fetchDns = useCallback(async () => {
    try {
      const res = await fetch("/api/dns");
      if (res.ok) {
        const data = await res.json();
        setDnsZones(data.zones ?? []);
      }
    } catch {
      setDnsZones([]);
    }
  }, []);

  const fetchFtp = useCallback(async () => {
    try {
      const res = await fetch("/api/ftp");
      if (res.ok) {
        const data = await res.json();
        setFtpUsers(data.users ?? []);
      }
    } catch {
      setFtpUsers([]);
    }
  }, []);

  const fetchBackups = useCallback(async () => {
    try {
      const res = await fetch("/api/backups");
      if (res.ok) {
        const data = await res.json();
        setBackups(data.backups ?? []);
      }
    } catch {
      setBackups([]);
    }
  }, []);

  const fetchInstallStatus = useCallback(async () => {
    try {
      const res = await fetch("/api/install");
      if (res.ok) setInstallStatus(await res.json());
    } catch {
      setInstallStatus(null);
    }
  }, []);

  const fetchWebsiteDetail = useCallback(async (domain: string) => {
    try {
      const res = await fetch(`/api/websites/${encodeURIComponent(domain)}`);
      if (res.ok) setWebsiteDetail(await res.json());
      else setWebsiteDetail(null);
    } catch {
      setWebsiteDetail(null);
    }
  }, []);

  const fetchNotes = useCallback(async () => {
    try {
      const res = await fetch("/api/notes");
      if (res.ok) {
        const data = await res.json();
        setServicesNotes(data.content ?? "");
      }
    } catch {
      setServicesNotes("");
    }
  }, []);

  const fetchSettings = useCallback(async () => {
    try {
      const res = await fetch("/api/settings");
      if (res.ok) {
        const data = await res.json();
        setPanelSettings(data);
        setNewWebserver(data.defaults?.webserver === "ols" ? "ols" : "nginx");
      }
    } catch {
      setPanelSettings(null);
    }
  }, []);

  const fetchTwoFactorState = useCallback(async () => {
    try {
      const res = await fetch("/api/auth/2fa");
      if (res.ok) {
        const data = await res.json();
        setTwoFactorState(data);
        setTwoFactorForm((prev) => ({
          ...prev,
          issuer: data.issuer || prev.issuer,
          label: data.label || prev.label,
        }));
      }
    } catch {
      setTwoFactorState(null);
    }
  }, []);

  const fetchIntegrations = useCallback(async () => {
    try {
      const res = await fetch("/api/integrations");
      if (res.ok) {
        const data = await res.json();
        setIntegrations(data.integrations ?? []);
      }
    } catch {
      setIntegrations([]);
    }
  }, []);

  const fetchSafeActions = useCallback(async () => {
    try {
      const res = await fetch("/api/actions");
      if (res.ok) {
        const data = await res.json();
        setSafeActions(data.actions ?? []);
      }
    } catch {
      setSafeActions([]);
    }
  }, []);

  const fetchAuditEntries = useCallback(async () => {
    try {
      const res = await fetch("/api/audit?limit=50");
      if (res.ok) {
        const data = await res.json();
        setAuditEntries(data.entries ?? []);
      }
    } catch {
      setAuditEntries([]);
    }
  }, []);

  const fetchFileManager = useCallback(async (path: string) => {
    setFileManagerLoading(true);
    try {
      const res = await fetch(`/api/files?path=${encodeURIComponent(path)}`);
      if (res.ok) {
        const data = await res.json();
        setFileManagerItems(data.items ?? []);
      } else {
        setFileManagerItems([]);
        setError("Failed to list directory");
      }
    } catch {
      setFileManagerItems([]);
      setError("Failed to load files");
    } finally {
      setFileManagerLoading(false);
    }
  }, []);

  useEffect(() => {
    if (typeof window !== "undefined" && !baseUrl) {
      setBaseUrl(`${window.location.protocol}//${window.location.hostname}`);
    }
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;

    const media = window.matchMedia("(max-width: 767px)");
    const applyViewportMode = (matches: boolean) => {
      setIsMobileViewport(matches);
      setOverviewSections({
        metrics: true,
        actions: true,
        trends: !matches,
        storage: !matches,
        resources: true,
        processes: !matches,
      });
      if (!matches) {
        setMobileNavOpen(false);
      }
    };

    applyViewportMode(media.matches);

    const listener = (event: MediaQueryListEvent) => applyViewportMode(event.matches);
    media.addEventListener("change", listener);
    return () => media.removeEventListener("change", listener);
  }, []);

  useEffect(() => {
    if (activeTab === "files") fetchFileManager(fileManagerPath);
    if (activeTab === "notes") fetchNotes();
    if (activeTab === "websites" && selectedWebsite) fetchWebsiteDetail(selectedWebsite);
    if (activeTab === "settings") fetchSettings();
    if (activeTab === "settings") fetchTwoFactorState();
    if (activeTab === "integrations") fetchIntegrations();
    if (activeTab === "actions") fetchSafeActions();
    if (activeTab === "audit") fetchAuditEntries();
  }, [activeTab, fileManagerPath, fetchFileManager, fetchNotes, selectedWebsite, fetchWebsiteDetail, fetchSettings, fetchTwoFactorState, fetchIntegrations, fetchSafeActions, fetchAuditEntries]);

  useEffect(() => {
    setMobileNavOpen(false);
  }, [activeTab]);

  useEffect(() => {
    if (selectedWebsite) fetchWebsiteDetail(selectedWebsite);
  }, [selectedWebsite, fetchWebsiteDetail]);

  useEffect(() => {
    fetchSystem();
    fetchProcesses();
    fetchPorts();
    fetchApps();
    fetchMinecraft();
    fetchSsl();
    fetchServer();
    fetchDocker();
    fetchWebsites();
    fetchFirewall();
    fetchDns();
    fetchFtp();
    fetchBackups();
    fetchInstallStatus();
    fetchSettings();
    fetchTwoFactorState();
    fetchIntegrations();
    fetchSafeActions();
    fetchAuditEntries();
    const t = setInterval(() => {
      if (typeof document !== "undefined" && document.hidden) return;
      fetchSystem();
      fetchProcesses();
      fetchPorts();
      fetchApps();
      if (activeTab === "minecraft") fetchMinecraft();
      if (activeTab === "ssl") fetchSsl();
      if (activeTab === "server") fetchServer();
      if (activeTab === "docker") fetchDocker();
      if (activeTab === "websites") fetchWebsites();
      if (activeTab === "firewall") fetchFirewall();
      if (activeTab === "dns") fetchDns();
      if (activeTab === "ftp") fetchFtp();
      if (activeTab === "backups") fetchBackups();
      if (activeTab === "installs") fetchInstallStatus();
      if (activeTab === "files") fetchFileManager(fileManagerPath);
      if (activeTab === "notes") fetchNotes();
      if (activeTab === "settings") fetchSettings();
      if (activeTab === "settings") fetchTwoFactorState();
      if (activeTab === "integrations") fetchIntegrations();
      if (activeTab === "actions") fetchSafeActions();
      if (activeTab === "audit") fetchAuditEntries();
    }, panelSettings?.dashboard.pollingIntervalMs ?? DEFAULT_POLL_INTERVAL);
    return () => clearInterval(t);
  }, [
    fetchSystem,
    fetchProcesses,
    fetchPorts,
    fetchApps,
    fetchMinecraft,
    fetchSsl,
    fetchServer,
    fetchInstallStatus,
    fetchFileManager,
    fetchNotes,
    fetchSettings,
    fetchTwoFactorState,
    fetchIntegrations,
    fetchSafeActions,
    fetchAuditEntries,
    activeTab,
    fileManagerPath,
    panelSettings?.dashboard.pollingIntervalMs,
  ]);

  const killProcess = async (pid: number) => {
    setKillingPid(pid);
    try {
      const res = await fetch("/api/process/kill", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pid }),
      });
      const data = await res.json();
      if (res.ok) {
        fetchProcesses();
      } else {
        setError(data.error || "Failed to kill process");
      }
    } catch {
      setError("Failed to kill process");
    } finally {
      setKillingPid(null);
    }
  };

  const minecraftAction = async (action: string) => {
    setMcAction(action);
    try {
      const res = await fetch("/api/minecraft", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action }),
      });
      const data = await res.json();
      if (res.ok) {
        fetchMinecraft();
      } else {
        setError(data.error || "Minecraft action failed");
      }
    } catch {
      setError("Minecraft action failed");
    } finally {
      setMcAction(null);
    }
  };

  const renewSsl = async () => {
    setSslRenewing(true);
    try {
      const res = await fetch("/api/ssl", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "renew" }),
      });
      const data = await res.json();
      if (res.ok) {
        fetchSsl();
      } else {
        setError(data.error || "SSL renew failed");
      }
    } catch {
      setError("SSL renew failed");
    } finally {
      setSslRenewing(false);
    }
  };

  const dockerAction = async (id: string, action: string) => {
    setContainerAction(id);
    try {
      const res = await fetch(`/api/docker/containers/${id}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action }),
      });
      const data = await res.json();
      if (res.ok) fetchDocker();
      else setError(data.error || "Docker action failed");
    } catch {
      setError("Docker action failed");
    } finally {
      setContainerAction(null);
    }
  };

  const createWebsite = async () => {
    const domain = newDomain.trim().toLowerCase().replace(/[^a-z0-9.-]/g, "");
    if (!domain) {
      setError("Enter a valid domain (e.g. example.com)");
      return;
    }
    setCreatingSite(true);
    setError(null);
    try {
      const res = await fetch("/api/websites/create", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ domain, wordpress: newWordpress, webserver: newWebserver, createDnsZone: newCreateDnsZone, issueSsl: newCreateSsl }),
      });
      const data = await res.json();
      if (res.ok) {
        setNewDomain("");
        setNewWordpress(false);
        setNewCreateDnsZone(false);
        setNewCreateSsl(false);
        fetchWebsites();
      } else {
        setError(data.error || "Failed to create site");
      }
    } catch {
      setError("Failed to create site");
    } finally {
      setCreatingSite(false);
    }
  };

  const serverAction = async (action: string) => {
    try {
      const res = await fetch("/api/server", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action }),
      });
      const data = await res.json();
      if (res.ok) {
        fetchServer();
      } else {
        setError(data.error || "Server action failed");
      }
    } catch {
      setError("Server action failed");
    }
  };

  const installPackage = async (pkg: "docker" | "nginx" | "certbot") => {
    setInstalling(pkg);
    setError(null);
    try {
      const res = await fetch("/api/install", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ package: pkg }),
      });
      const data = await res.json();
      if (res.ok && data.ok) {
        fetchInstallStatus();
        fetchDocker();
        fetchSsl();
        fetchServer();
      } else {
        setError(data.error || data.message || "Install failed");
      }
    } catch {
      setError("Install failed");
    } finally {
      setInstalling(null);
    }
  };

  const saveSettings = async () => {
    if (!panelSettings) return;
    setSettingsSaving(true);
    setError(null);
    try {
      const res = await fetch("/api/settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(panelSettings),
      });
      const data = await res.json();
      if (res.ok) {
        setPanelSettings(data.settings ?? panelSettings);
      } else {
        setError(data.error || "Failed to save settings");
      }
    } catch {
      setError("Failed to save settings");
    } finally {
      setSettingsSaving(false);
    }
  };

  const startTwoFactorSetup = async () => {
    setTwoFactorLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/auth/2fa", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "setup",
          password: twoFactorForm.password,
          issuer: twoFactorForm.issuer,
          label: twoFactorForm.label,
        }),
      });
      const data = await res.json();
      if (res.ok) {
        setTwoFactorSetupSecret(data.secret || "");
        setTwoFactorOtpAuthUri(data.otpauthUri || "");
        fetchTwoFactorState();
      } else {
        setError(data.error || "Failed to start 2FA setup");
      }
    } catch {
      setError("Failed to start 2FA setup");
    } finally {
      setTwoFactorLoading(false);
    }
  };

  const confirmTwoFactorSetup = async () => {
    setTwoFactorLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/auth/2fa", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "confirm",
          code: twoFactorForm.code,
        }),
      });
      const data = await res.json();
      if (res.ok) {
        setTwoFactorSetupSecret("");
        setTwoFactorOtpAuthUri("");
        setTwoFactorForm((prev) => ({ ...prev, code: "", password: "" }));
        fetchTwoFactorState();
      } else {
        setError(data.error || "Failed to confirm 2FA");
      }
    } catch {
      setError("Failed to confirm 2FA");
    } finally {
      setTwoFactorLoading(false);
    }
  };

  const disableTwoFactor = async () => {
    setTwoFactorLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/auth/2fa", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "disable",
          password: twoFactorForm.password,
          code: twoFactorForm.code,
        }),
      });
      const data = await res.json();
      if (res.ok) {
        setTwoFactorSetupSecret("");
        setTwoFactorOtpAuthUri("");
        setTwoFactorForm((prev) => ({ ...prev, code: "", password: "" }));
        fetchTwoFactorState();
      } else {
        setError(data.error || "Failed to disable 2FA");
      }
    } catch {
      setError("Failed to disable 2FA");
    } finally {
      setTwoFactorLoading(false);
    }
  };

  const saveIntegrations = async (nextIntegrations: Integration[]) => {
    setIntegrationsSaving(true);
    setError(null);
    try {
      const res = await fetch("/api/integrations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ integrations: nextIntegrations }),
      });
      const data = await res.json();
      if (res.ok) {
        setIntegrations(data.integrations ?? nextIntegrations);
        fetchIntegrations();
      } else {
        setError(data.error || "Failed to save integrations");
      }
    } catch {
      setError("Failed to save integrations");
    } finally {
      setIntegrationsSaving(false);
    }
  };

  const updateIntegration = (
    id: string,
    field: keyof Pick<Integration, "enabled" | "url" | "healthUrl" | "port">,
    value: boolean | string
  ) => {
    setIntegrations((prev) =>
      prev.map((integration) =>
        integration.id === id ? { ...integration, [field]: value } : integration
      )
    );
  };

  const toggleOverviewSection = (key: OverviewSectionKey) => {
    setOverviewSections((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  const runSafeAction = async (action: SafeAction) => {
    setActionRunning(action.id);
    setError(null);
    try {
      const res = await fetch("/api/actions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: action.id }),
      });
      const data = await res.json();
      if (res.ok) {
        setActionOutput({
          label: data.label || action.label,
          output: data.output || "Command completed with no output.",
        });
        fetchAuditEntries();
      } else {
        setError(data.error || "Failed to run action");
      }
    } catch {
      setError("Failed to run action");
    } finally {
      setActionRunning(null);
    }
  };

  const navGroups: {
    title: string;
    items: { id: Tab; label: string; meta?: string }[];
  }[] = [
    {
      title: "Primary",
      items: [
        { id: "overview", label: "Overview", meta: "Health and recent activity" },
        { id: "websites", label: "Sites", meta: `${websites.length} configured` },
        { id: "docker", label: "Containers", meta: `${dockerContainers.length} detected` },
        { id: "apps", label: "Hosted Apps", meta: `${apps.length} reachable` },
      ],
    },
    {
      title: "Operations",
      items: [
        { id: "backups", label: "Backups" },
        { id: "ssl", label: "SSL" },
        { id: "dns", label: "DNS" },
        { id: "firewall", label: "Firewall" },
        { id: "files", label: "Files" },
        { id: "integrations", label: "Integrations", meta: "Immich, Nextcloud, custom apps" },
      ],
    },
    {
      title: "System",
      items: [
        { id: "server", label: "Server" },
        { id: "installs", label: "Installs" },
        { id: "ftp", label: "FTP" },
        { id: "minecraft", label: "Minecraft" },
        { id: "actions", label: "Safe Actions", meta: "Approved CLI operations" },
        { id: "audit", label: "Audit", meta: "Recent admin activity" },
        { id: "notes", label: "Notes" },
        { id: "settings", label: "Settings", meta: "Live dashboard and defaults" },
      ],
    },
  ];
  const compactNavItems = navGroups.flatMap((group) => group.items);
  const livePollMs = panelSettings?.dashboard.pollingIntervalMs ?? DEFAULT_POLL_INTERVAL;
  const compactMode = Boolean(panelSettings?.dashboard.compactMode);
  const showGpu = panelSettings?.dashboard.showGpu ?? true;
  const showProcessTable = panelSettings?.dashboard.showProcessTable ?? true;

  const serverName = system?.os?.hostname || serverInfo?.hostname || "Server Panel";
  const healthChecks = [
    { label: "Web server", healthy: Boolean(installStatus?.nginx.installed), detail: installStatus?.nginx.installed ? "nginx ready" : "nginx missing" },
    { label: "Docker", healthy: dockerAvailable, detail: dockerAvailable ? `${dockerContainers.length} containers visible` : "runtime unavailable" },
    { label: "SSL", healthy: Boolean(ssl?.certbotInstalled), detail: ssl?.certbotInstalled ? `${ssl?.certs.length ?? 0} certs found` : "certbot missing" },
    { label: "Firewall", healthy: Boolean(firewall?.enabled), detail: firewall?.enabled ? `${firewall.rules.length} rules active` : "ufw disabled" },
  ];
  const healthyChecks = healthChecks.filter((item) => item.healthy).length;
  const healthTone =
    healthyChecks >= 3 ? "Healthy" : healthyChecks >= 2 ? "Needs attention" : "At risk";
  const recentItems = [
    ...websites.slice(0, 3).map((site) => ({
      name: site.domain,
      meta: site.root,
      status: "Site",
    })),
    ...dockerContainers.slice(0, 3).map((container) => ({
      name: container.name,
      meta: container.status || container.image,
      status: container.state === "running" ? "Running" : "Stopped",
    })),
  ].slice(0, 6);
  const topVolumes = system?.storage?.volumes?.slice(0, 4) ?? [];
  const storageDevices = system?.storage?.devices?.slice(0, 4) ?? [];
  const enabledIntegrations = integrations.filter((integration) => integration.enabled);
  const createSiteSummary = [
    `Web root: ${panelSettings?.defaults.fileManagerRootLabel || "/var/www"}/${newDomain.trim() || "example.com"}`,
    `Web server: ${newWebserver === "nginx" ? "nginx" : "OpenLiteSpeed"}`,
    newWordpress ? "App stack: WordPress in Docker" : "App stack: static site scaffold",
    newCreateDnsZone ? "DNS zone will be created" : "DNS handled externally",
    newCreateSsl ? "SSL will be requested" : "SSL can be added later",
  ];

  return (
    <div className="flex h-screen overflow-hidden bg-[radial-gradient(circle_at_top,_rgba(34,211,238,0.12),_transparent_35%),_var(--background)]">
      {mobileNavOpen && (
        <div className="fixed inset-0 z-40 xl:hidden">
          <button
            aria-label="Close navigation"
            onClick={() => setMobileNavOpen(false)}
            className="absolute inset-0 bg-black/60 backdrop-blur-sm"
          />
          <div className="absolute inset-y-0 left-0 w-[86%] max-w-sm border-r border-[var(--border)] bg-[var(--background)] shadow-2xl">
            <div className="flex items-center justify-between border-b border-[var(--border)] px-5 py-5">
              <div>
                <p className="text-[11px] uppercase tracking-[0.22em] text-[var(--accent)]">
                  Server Panel
                </p>
                <p className="mt-2 text-lg font-semibold">{serverName}</p>
              </div>
              <button
                onClick={() => setMobileNavOpen(false)}
                className="rounded-xl border border-[var(--border)] px-3 py-2 text-sm text-[var(--muted)]"
              >
                Close
              </button>
            </div>
            <nav className="dashboard-scroll h-[calc(100%-84px)] space-y-6 px-4 py-5">
              {navGroups.map((group) => (
                <details key={group.title} open className="rounded-2xl border border-[var(--border)] bg-[var(--card)]">
                  <summary className="cursor-pointer list-none px-4 py-3 text-sm font-medium text-[var(--foreground)]">
                    {group.title}
                  </summary>
                  <div className="space-y-1 border-t border-[var(--border)] p-2">
                    {group.items.map((item) => (
                      <button
                        key={item.id}
                        onClick={() => setActiveTab(item.id)}
                        className={cx(
                          "w-full rounded-xl px-3 py-3 text-left transition",
                          activeTab === item.id
                            ? "bg-[var(--accent)]/12 text-[var(--accent)]"
                            : "text-[var(--foreground)] hover:bg-black/20"
                        )}
                      >
                        <div className="font-medium">{item.label}</div>
                        {item.meta && <div className="mt-1 text-xs text-[var(--muted)]">{item.meta}</div>}
                      </button>
                    ))}
                  </div>
                </details>
              ))}
            </nav>
          </div>
        </div>
      )}

      <aside className="hidden w-72 shrink-0 border-r border-[var(--border)] bg-black/20 xl:flex xl:flex-col">
        <div className="border-b border-[var(--border)] px-6 py-6">
          <p className="text-[11px] uppercase tracking-[0.22em] text-[var(--accent)]">
            Server Panel
          </p>
          <h1 className="mt-3 text-2xl font-semibold tracking-tight">{serverName}</h1>
          <p className="mt-2 text-sm text-[var(--muted)]">
            Cleaner hosting workflows for sites, containers, and server operations.
          </p>
        </div>

        <nav className="dashboard-scroll flex-1 space-y-6 px-4 py-5">
          {navGroups.map((group) => (
            <div key={group.title}>
              <p className="px-3 text-[11px] uppercase tracking-[0.2em] text-[var(--muted)]">
                {group.title}
              </p>
              <div className="mt-2 space-y-1">
                {group.items.map((item) => (
                  <button
                    key={item.id}
                    onClick={() => setActiveTab(item.id)}
                    className={cx(
                      "w-full rounded-2xl border px-3 py-3 text-left transition",
                      activeTab === item.id
                        ? "border-[var(--accent)]/40 bg-[var(--accent)]/10"
                        : "border-transparent hover:border-[var(--border)] hover:bg-[var(--card)]/70"
                    )}
                  >
                    <div className="flex items-center justify-between gap-3">
                      <span className="font-medium text-[var(--foreground)]">{item.label}</span>
                      {activeTab === item.id && (
                        <span className="rounded-full bg-[var(--accent)]/15 px-2 py-0.5 text-[10px] uppercase tracking-[0.18em] text-[var(--accent)]">
                          Open
                        </span>
                      )}
                    </div>
                    {item.meta && <p className="mt-1 text-xs text-[var(--muted)]">{item.meta}</p>}
                  </button>
                ))}
              </div>
            </div>
          ))}
        </nav>

        <div className="border-t border-[var(--border)] p-4">
          <div className="rounded-2xl border border-[var(--border)] bg-[var(--card)] p-4">
            <p className="text-xs uppercase tracking-[0.2em] text-[var(--muted)]">System health</p>
            <p className="mt-2 text-lg font-semibold">{healthTone}</p>
            <p className="mt-1 text-sm text-[var(--muted)]">
              {healthyChecks}/{healthChecks.length} core services ready
            </p>
          </div>
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
        <header className="sticky top-0 z-20 shrink-0 border-b border-[var(--border)] bg-[var(--background)]/90 backdrop-blur-sm">
          <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-4 md:px-6">
            <div>
              <p className="text-xs uppercase tracking-[0.18em] text-[var(--muted)]">Live server</p>
              <div className="mt-1 flex items-center gap-3">
                <h2 className="text-xl font-semibold tracking-tight md:text-2xl">{serverName}</h2>
                <span className="inline-flex items-center gap-2 rounded-full border border-emerald-500/20 bg-emerald-500/10 px-3 py-1 text-xs text-emerald-300">
                  <span className="h-2 w-2 rounded-full bg-emerald-400 animate-pulse" />
                  {healthTone}
                </span>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <button
                onClick={() => setMobileNavOpen(true)}
                className="rounded-xl border border-[var(--border)] px-3 py-2 text-sm text-[var(--foreground)] xl:hidden"
              >
                Menu
              </button>
              <button
                onClick={() => setActiveTab("websites")}
                className="rounded-xl bg-[var(--accent)] px-4 py-2 text-sm font-medium text-slate-950 transition hover:bg-cyan-300"
              >
                Create Site
              </button>
              <button
                onClick={() => setActiveTab("docker")}
                className="hidden rounded-xl border border-[var(--border)] px-4 py-2 text-sm text-[var(--foreground)] transition hover:bg-[var(--card)] sm:inline-flex"
              >
                Manage Containers
              </button>
              <button
                onClick={async () => {
                  await fetch("/api/auth/logout", { method: "POST" });
                  window.location.reload();
                }}
                className="rounded-xl border border-[var(--border)] px-4 py-2 text-sm text-[var(--muted)] transition hover:bg-[var(--card)] hover:text-[var(--foreground)]"
              >
                Logout
              </button>
            </div>
          </div>
          <div className="dashboard-scroll hidden border-t border-[var(--border)] px-4 py-3 md:block xl:hidden">
            <div className="flex gap-2">
              {compactNavItems.map((item) => (
                <button
                  key={item.id}
                  onClick={() => setActiveTab(item.id)}
                  className={cx(
                    "shrink-0 rounded-xl border px-3 py-2 text-sm transition",
                    activeTab === item.id
                      ? "border-[var(--accent)]/40 bg-[var(--accent)]/10 text-[var(--accent)]"
                      : "border-[var(--border)] text-[var(--muted)] hover:bg-[var(--card)]"
                  )}
                >
                  {item.label}
                </button>
              ))}
            </div>
          </div>
        </header>

        <main className={cx("dashboard-content dashboard-scroll flex-1 px-4 py-4 md:px-6 md:py-5", compactMode && "space-y-4")}>
      {error && (
        <div className="mb-4 flex items-center justify-between rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-400">
          {error}
          <button onClick={() => setError(null)} className="hover:underline">
            Dismiss
          </button>
        </div>
      )}

      {activeTab === "overview" && (
        <>
          <section className="mb-6 grid gap-4 xl:grid-cols-[1.4fr_0.95fr]">
            <div className="rounded-3xl border border-[var(--border)] bg-[linear-gradient(135deg,rgba(34,211,238,0.16),rgba(24,24,27,0.96)_55%)] p-6">
              <p className="text-xs uppercase tracking-[0.22em] text-[var(--accent)]">Overview</p>
              <h3 className="mt-3 max-w-2xl text-3xl font-semibold tracking-tight text-[var(--foreground)]">
                Focus on sites and containers first, with the rest of the server in reach.
              </h3>
              <p className="mt-3 max-w-2xl text-sm leading-6 text-[var(--muted)]">
                This panel is now organized around the workflows you use most often:
                create a site, manage containers, review health, and jump into fixes fast.
              </p>
              <div className="mt-4 flex flex-wrap gap-2 text-xs text-[var(--muted)]">
                <span className="rounded-full border border-[var(--border)] px-3 py-1">
                  Live refresh every {Math.round(livePollMs / 1000)}s
                </span>
                <span className="rounded-full border border-[var(--border)] px-3 py-1">
                  {showGpu ? "GPU metrics visible" : "GPU metrics hidden"}
                </span>
                <span className="rounded-full border border-[var(--border)] px-3 py-1">
                  {enabledIntegrations.length} integrations enabled
                </span>
              </div>
              <div className="mt-6 flex flex-wrap gap-3">
                <button
                  onClick={() => setActiveTab("websites")}
                  className="rounded-xl bg-[var(--accent)] px-4 py-2.5 text-sm font-medium text-slate-950 hover:bg-cyan-300"
                >
                  Create Site
                </button>
                <button
                  onClick={() => setActiveTab("docker")}
                  className="rounded-xl border border-[var(--border)] px-4 py-2.5 text-sm hover:bg-black/20"
                >
                  Manage Containers
                </button>
                <button
                  onClick={() => setActiveTab("backups")}
                  className="rounded-xl border border-[var(--border)] px-4 py-2.5 text-sm hover:bg-black/20"
                >
                  Review Backups
                </button>
              </div>
            </div>

            <div className="rounded-3xl border border-[var(--border)] bg-[var(--card)] p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs uppercase tracking-[0.2em] text-[var(--muted)]">
                    Server snapshot
                  </p>
                  <p className="mt-2 text-xl font-semibold">{healthTone}</p>
                </div>
                <span className="rounded-full border border-[var(--border)] px-3 py-1 text-xs text-[var(--muted)]">
                  Live
                </span>
              </div>
              <div className="mt-5 space-y-3">
                <div className="flex items-center justify-between text-sm">
                  <span className="text-[var(--muted)]">Hostname</span>
                  <span className="font-mono">{serverName}</span>
                </div>
                <div className="flex items-center justify-between text-sm">
                  <span className="text-[var(--muted)]">Uptime</span>
                  <span>{system?.os ? formatUptime(system.os.uptime) : "—"}</span>
                </div>
                <div className="flex items-center justify-between text-sm">
                  <span className="text-[var(--muted)]">Containers</span>
                  <span>{dockerContainers.length}</span>
                </div>
                <div className="flex items-center justify-between text-sm">
                  <span className="text-[var(--muted)]">Sites</span>
                  <span>{websites.length}</span>
                </div>
              </div>
            </div>
          </section>

          <CollapsibleSection
            title="Live metrics"
            description="CPU, memory, disk, app count, and GPU telemetry."
            defaultOpen
            open={isMobileViewport ? overviewSections.metrics : undefined}
            onToggle={isMobileViewport ? () => toggleOverviewSection("metrics") : undefined}
          >
          <div className={cx("grid gap-4 md:grid-cols-2", showGpu ? "xl:grid-cols-5" : "xl:grid-cols-4")}>
            <MetricCard
              label="CPU"
              value={`${system?.cpu?.current ?? "—"}%`}
              meta={`${system?.cpu?.cores ?? "—"} cores in use`}
              toneClass="text-[var(--accent)]"
            />
            <MetricCard
              label="Memory"
              value={`${system?.memory?.usedPercent ?? "—"}%`}
              meta={
                system?.memory
                  ? `${formatBytes(system.memory.used)} of ${formatBytes(system.memory.total)}`
                  : "Waiting for memory stats"
              }
              toneClass="text-amber-400"
            />
            <MetricCard
              label="Disk"
              value={`${system?.disk?.usedPercent ?? "—"}%`}
              meta={
                system?.disk
                  ? `${formatBytes(system.disk.used)} of ${formatBytes(system.disk.total)}`
                  : "Waiting for disk stats"
              }
              toneClass="text-violet-400"
            />
            <MetricCard
              label="Active apps"
              value={`${apps.length}`}
              meta={`${ports.length} listening ports detected`}
              toneClass="text-emerald-400"
            />
            {showGpu && (
              <MetricCard
                label="GPU"
                value={system?.gpu?.utilizationGpu != null ? `${system.gpu.utilizationGpu}%` : system?.gpu?.model || "—"}
                meta={
                  system?.gpu
                    ? `${system.gpu.model} · ${system.gpu.vram ? `${system.gpu.vram} MB VRAM` : "No VRAM data"}`
                    : "GPU not detected"
                }
                toneClass="text-cyan-300"
              />
            )}
          </div>
          </CollapsibleSection>

          <div className="mb-6" />
          <CollapsibleSection
            title="Priority actions"
            description="Fast paths for the core jobs you do most often."
            defaultOpen
            open={isMobileViewport ? overviewSections.actions : undefined}
            onToggle={isMobileViewport ? () => toggleOverviewSection("actions") : undefined}
          >
            <div className="mb-3 flex items-center justify-between">
              <h2 className="text-sm font-semibold">Recommended flow</h2>
              <p className="text-xs uppercase tracking-[0.18em] text-[var(--muted)]">
                Based on the new Stitch layout
              </p>
            </div>
            <div className="grid gap-4 lg:grid-cols-2 xl:grid-cols-4">
              <QuickActionCard
                title="Create Site"
                description="Spin up a static site or WordPress stack with optional DNS and SSL from one place."
                meta={`${websites.length} sites currently configured`}
                onClick={() => setActiveTab("websites")}
              />
              <QuickActionCard
                title="Manage Containers"
                description="Check running containers, restart failed ones, and review exposed ports quickly."
                meta={dockerAvailable ? `${dockerContainers.length} containers visible` : "Docker runtime unavailable"}
                onClick={() => setActiveTab("docker")}
              />
              <QuickActionCard
                title="Backups"
                description="Create and review snapshots before changes or after a deployment."
                meta={`${backups.length} backups available`}
                onClick={() => setActiveTab("backups")}
              />
              <QuickActionCard
                title="SSL Certificates"
                description="Track certificate coverage and renew certbot-managed domains without leaving the panel."
                meta={`${ssl?.certs.length ?? 0} certificates found`}
                onClick={() => setActiveTab("ssl")}
              />
            </div>
          </CollapsibleSection>

          <div className="mb-6" />
          <CollapsibleSection
            title="Storage"
            description="Mounted volumes and detected drives."
            defaultOpen={!isMobileViewport}
            open={isMobileViewport ? overviewSections.storage : undefined}
            onToggle={isMobileViewport ? () => toggleOverviewSection("storage") : undefined}
          >
          <div className="grid gap-4 xl:grid-cols-2">
            <div className="rounded-2xl border border-[var(--border)] bg-[var(--card)] p-5">
              <div className="mb-4 flex items-center justify-between">
                <h2 className="text-base font-semibold">Storage volumes</h2>
                <button
                  onClick={() => setActiveTab("server")}
                  className="text-xs text-[var(--accent)] hover:underline"
                >
                  Open server tools
                </button>
              </div>
              <div className="space-y-3">
                {topVolumes.length === 0 ? (
                  <p className="rounded-xl border border-dashed border-[var(--border)] px-4 py-6 text-sm text-[var(--muted)]">
                    No storage volumes detected.
                  </p>
                ) : (
                  topVolumes.map((volume) => (
                    <div key={`${volume.mount}-${volume.fs}`} className="rounded-xl border border-[var(--border)] px-4 py-3">
                      <div className="flex items-center justify-between gap-4">
                        <div className="min-w-0">
                          <p className="truncate font-medium">{volume.mount || volume.fs}</p>
                          <p className="truncate text-sm text-[var(--muted)]">
                            {volume.fs} · {volume.type || "volume"}
                          </p>
                        </div>
                        <span className="font-mono text-sm text-[var(--foreground)]">
                          {volume.usedPercent}%
                        </span>
                      </div>
                      <div className="mt-3 h-2 rounded-full bg-black/20">
                        <div
                          className="h-2 rounded-full bg-violet-400"
                          style={{ width: `${Math.min(volume.usedPercent, 100)}%` }}
                        />
                      </div>
                      <p className="mt-2 text-xs text-[var(--muted)]">
                        {formatBytes(volume.used)} used of {formatBytes(volume.total)}
                      </p>
                    </div>
                  ))
                )}
              </div>
            </div>

            <div className="rounded-2xl border border-[var(--border)] bg-[var(--card)] p-5">
              <div className="mb-4 flex items-center justify-between">
                <h2 className="text-base font-semibold">Detected drives</h2>
                <button
                  onClick={() => setActiveTab("settings")}
                  className="text-xs text-[var(--accent)] hover:underline"
                >
                  Tune dashboard
                </button>
              </div>
              <div className="space-y-3">
                {storageDevices.length === 0 ? (
                  <p className="rounded-xl border border-dashed border-[var(--border)] px-4 py-6 text-sm text-[var(--muted)]">
                    No physical drive metadata detected.
                  </p>
                ) : (
                  storageDevices.map((device) => (
                    <div key={`${device.name}-${device.interface}`} className="flex items-center justify-between gap-4 rounded-xl border border-[var(--border)] px-4 py-3">
                      <div className="min-w-0">
                        <p className="truncate font-medium">{device.name}</p>
                        <p className="text-sm text-[var(--muted)]">
                          {device.type} · {device.interface}
                        </p>
                      </div>
                      <span className="text-sm text-[var(--foreground)]">
                        {device.size ? formatBytes(device.size) : "Unknown"}
                      </span>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>
          </CollapsibleSection>

          <div className="mb-6" />
          <CollapsibleSection
            title="Live trends"
            description="Two-minute CPU and memory history."
            defaultOpen={!isMobileViewport}
            open={isMobileViewport ? overviewSections.trends : undefined}
            onToggle={isMobileViewport ? () => toggleOverviewSection("trends") : undefined}
          >
          <div className="grid gap-4 md:grid-cols-2">
            <div className="rounded-xl border border-[var(--border)] bg-[var(--card)] p-4">
              <h2 className="mb-3 text-sm font-semibold">CPU (last 2 min)</h2>
              <div className="h-32 min-h-[128px]">
                <ResponsiveContainer width="100%" height={128}>
                  <AreaChart data={cpuHistory}>
                    <defs>
                      <linearGradient id="cpuGrad" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="var(--accent)" stopOpacity={0.4} />
                        <stop offset="100%" stopColor="var(--accent)" stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <XAxis dataKey="time" tick={{ fontSize: 10 }} stroke="var(--muted)" />
                    <YAxis domain={[0, 100]} tick={{ fontSize: 10 }} stroke="var(--muted)" />
                    <Tooltip
                      contentStyle={{
                        background: "var(--card)",
                        border: "1px solid var(--border)",
                        borderRadius: "8px",
                      }}
                      formatter={(v) => [v != null ? `${v}%` : "—", "CPU"]}
                    />
                    <Area
                      type="monotone"
                      dataKey="cpu"
                      stroke="var(--accent)"
                      fill="url(#cpuGrad)"
                      strokeWidth={2}
                    />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            </div>
            <div className="rounded-xl border border-[var(--border)] bg-[var(--card)] p-4">
              <h2 className="mb-3 text-sm font-semibold">Memory (last 2 min)</h2>
              <div className="h-32 min-h-[128px]">
                <ResponsiveContainer width="100%" height={128}>
                  <AreaChart data={memHistory}>
                    <defs>
                      <linearGradient id="memGrad" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="#fbbf24" stopOpacity={0.4} />
                        <stop offset="100%" stopColor="#fbbf24" stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <XAxis dataKey="time" tick={{ fontSize: 10 }} stroke="var(--muted)" />
                    <YAxis domain={[0, 100]} tick={{ fontSize: 10 }} stroke="var(--muted)" />
                    <Tooltip
                      contentStyle={{
                        background: "var(--card)",
                        border: "1px solid var(--border)",
                        borderRadius: "8px",
                      }}
                      formatter={(v) => [v != null ? `${v}%` : "—", "Memory"]}
                    />
                    <Area
                      type="monotone"
                      dataKey="mem"
                      stroke="#fbbf24"
                      fill="url(#memGrad)"
                      strokeWidth={2}
                    />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            </div>
          </div>
          </CollapsibleSection>

          <div className="mb-6" />
          <CollapsibleSection
            title="Resources and health"
            description="Recent items, health checks, and app quick links."
            defaultOpen
            open={isMobileViewport ? overviewSections.resources : undefined}
            onToggle={isMobileViewport ? () => toggleOverviewSection("resources") : undefined}
          >
          <div className="grid gap-6 xl:grid-cols-[1.15fr_1fr_0.9fr]">
            <div className="rounded-2xl border border-[var(--border)] bg-[var(--card)] p-5">
              <div className="mb-4 flex items-center justify-between">
                <h2 className="text-base font-semibold">Recent sites and containers</h2>
                <button
                  onClick={() => setActiveTab("websites")}
                  className="text-xs text-[var(--accent)] hover:underline"
                >
                  Open details
                </button>
              </div>
              <div className="space-y-3">
                {recentItems.length === 0 ? (
                  <p className="rounded-xl border border-dashed border-[var(--border)] px-4 py-6 text-sm text-[var(--muted)]">
                    No recent resources yet.
                  </p>
                ) : (
                  recentItems.map((item) => (
                    <div
                      key={`${item.status}-${item.name}`}
                      className="flex items-center justify-between gap-4 rounded-xl border border-[var(--border)] px-4 py-3"
                    >
                      <div className="min-w-0">
                        <p className="truncate font-medium">{item.name}</p>
                        <p className="truncate text-sm text-[var(--muted)]">{item.meta}</p>
                      </div>
                      <span className="rounded-full border border-[var(--border)] px-2.5 py-1 text-xs text-[var(--muted)]">
                        {item.status}
                      </span>
                    </div>
                  ))
                )}
              </div>
            </div>

            <div className="rounded-2xl border border-[var(--border)] bg-[var(--card)] p-5">
              <div className="mb-4 flex items-center justify-between">
                <h2 className="text-base font-semibold">Health checklist</h2>
                <button
                  onClick={() => setActiveTab("server")}
                  className="text-xs text-[var(--accent)] hover:underline"
                >
                  Open system tools
                </button>
              </div>
              <div className="space-y-3">
                {healthChecks.map((item) => (
                  <div
                    key={item.label}
                    className="flex items-center justify-between gap-4 rounded-xl border border-[var(--border)] px-4 py-3"
                  >
                    <div>
                      <p className="font-medium">{item.label}</p>
                      <p className="text-sm text-[var(--muted)]">{item.detail}</p>
                    </div>
                    <span
                      className={cx(
                        "rounded-full px-2.5 py-1 text-xs",
                        item.healthy
                          ? "bg-emerald-500/15 text-emerald-300"
                          : "bg-amber-500/15 text-amber-300"
                      )}
                    >
                      {item.healthy ? "Ready" : "Check"}
                    </span>
                  </div>
                ))}
              </div>
            </div>

            <div className="rounded-2xl border border-[var(--border)] bg-[var(--card)] p-5">
              <div className="mb-4 flex items-center justify-between">
                <h2 className="text-base font-semibold">Quick links</h2>
                <button
                  onClick={() => setActiveTab("apps")}
                  className="text-xs text-[var(--accent)] hover:underline"
                >
                  View all apps
                </button>
              </div>
              <div className="space-y-3">
                {apps.length === 0 ? (
                  <p className="rounded-xl border border-dashed border-[var(--border)] px-4 py-6 text-sm text-[var(--muted)]">
                    No detected apps.
                  </p>
                ) : (
                  apps.slice(0, 6).map((app) => (
                    <a
                      key={`${app.port}-${app.name}`}
                      href={app.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center justify-between gap-4 rounded-xl border border-[var(--border)] px-4 py-3 transition hover:bg-[var(--border)]/40"
                    >
                      <div className="min-w-0">
                        <p className="truncate font-medium">{app.name}</p>
                        <p className="text-sm text-[var(--muted)]">{app.process || "Unknown process"}</p>
                      </div>
                      <span className="font-mono text-xs text-[var(--muted)]">:{app.port}</span>
                    </a>
                  ))
                )}
              </div>
            </div>
          </div>
          </CollapsibleSection>

          <div className="mb-6" />
          <CollapsibleSection
            title="Processes and ports"
            description="Live process activity and listening ports."
            defaultOpen={!isMobileViewport}
            open={isMobileViewport ? overviewSections.processes : undefined}
            onToggle={isMobileViewport ? () => toggleOverviewSection("processes") : undefined}
          >
          <div className="grid gap-6 lg:grid-cols-2">
            {showProcessTable ? (
            <div className="rounded-2xl border border-[var(--border)] bg-[var(--card)] p-5">
              <div className="mb-3 flex items-center justify-between">
                <h2 className="text-base font-semibold">Processes</h2>
                <div className="flex gap-2">
                  {(["cpu", "mem", "name"] as const).map((s) => (
                    <button
                      key={s}
                      onClick={() => setSortBy(s)}
                      className={cx(
                        "rounded-md px-2.5 py-1 text-xs font-medium transition-colors",
                        sortBy === s
                          ? "bg-[var(--accent)]/20 text-[var(--accent)]"
                          : "text-[var(--muted)] hover:bg-[var(--border)] hover:text-[var(--foreground)]"
                      )}
                    >
                      {s}
                    </button>
                  ))}
                </div>
              </div>
              <div className="max-h-72 overflow-y-auto">
                <table className="w-full text-left text-sm">
                  <thead className="sticky top-0 z-10 bg-[var(--card)] text-[var(--muted)]">
                    <tr>
                      <th className="px-4 py-3 font-medium">Process</th>
                      <th className="px-4 py-3 font-medium">PID</th>
                      <th className="px-4 py-3 font-medium text-right">CPU</th>
                      <th className="px-4 py-3 font-medium w-20"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {processes.slice(0, 12).map((p) => (
                      <tr key={p.pid} className="border-t border-[var(--border)] hover:bg-[var(--border)]/50">
                        <td className="px-4 py-2">
                          <p className="font-mono">{p.name}</p>
                          <p className="text-xs text-[var(--muted)]">{p.user}</p>
                        </td>
                        <td className="px-4 py-2 text-[var(--muted)]">{p.pid}</td>
                        <td className="px-4 py-2 text-right font-mono">{p.cpu ?? 0}%</td>
                        <td className="px-4 py-2">
                          <button
                            onClick={() => killProcess(p.pid)}
                            disabled={killingPid === p.pid}
                            className="rounded bg-red-500/20 px-2 py-1 text-xs text-red-400 hover:bg-red-500/30 disabled:opacity-50"
                          >
                            {killingPid === p.pid ? "…" : "Kill"}
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
            ) : (
            <div className="rounded-2xl border border-[var(--border)] bg-[var(--card)] p-5">
              <h2 className="text-base font-semibold">Processes</h2>
              <p className="mt-3 text-sm text-[var(--muted)]">
                Process table is hidden in dashboard settings. Re-enable it in the
                settings page if you want live process visibility here.
              </p>
              <button
                onClick={() => setActiveTab("settings")}
                className="mt-4 rounded-xl border border-[var(--border)] px-4 py-2 text-sm hover:bg-[var(--border)]/50"
              >
                Open Settings
              </button>
            </div>
            )}

            <div>
              <h2 className="mb-3 text-sm font-semibold">Listening ports</h2>
              <div className="max-h-64 overflow-y-auto rounded-xl border border-[var(--border)] bg-[var(--card)]">
                <table className="w-full text-sm">
                  <thead className="sticky top-0 bg-[var(--card)] text-[var(--muted)]">
                    <tr>
                      <th className="px-4 py-3 font-medium">Port</th>
                      <th className="px-4 py-3 font-medium">Protocol</th>
                      <th className="px-4 py-3 font-medium">Process</th>
                      <th className="px-4 py-3 font-medium">PID</th>
                    </tr>
                  </thead>
                  <tbody>
                    {ports.map(({ port, connections }) =>
                      connections.map((c, i) => (
                        <tr
                          key={`${port}-${i}`}
                          className="border-t border-[var(--border)] hover:bg-[var(--border)]/50"
                        >
                          <td className="px-4 py-2 font-mono">{port}</td>
                          <td className="px-4 py-2 text-[var(--muted)]">{c.protocol}</td>
                          <td className="px-4 py-2 font-mono">{c.process || "—"}</td>
                          <td className="px-4 py-2 text-[var(--muted)]">{c.pid ?? "—"}</td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>
            <div>
              <h2 className="mb-3 text-sm font-semibold">Hosted apps (quick links)</h2>
              <div className="max-h-64 overflow-y-auto rounded-xl border border-[var(--border)] bg-[var(--card)]">
                <div className="divide-y divide-[var(--border)]">
                  {apps.length === 0 ? (
                    <p className="px-4 py-6 text-center text-sm text-[var(--muted)]">
                      No detected apps.
                    </p>
                  ) : (
                    apps.slice(0, 15).map((app) => (
                      <a
                        key={`${app.port}-${app.name}`}
                        href={app.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex items-center justify-between gap-4 px-4 py-3 hover:bg-[var(--border)]/50"
                      >
                        <span className="font-medium">{app.name}</span>
                        <span className="font-mono text-xs text-[var(--muted)]">:{app.port}</span>
                      </a>
                    ))
                  )}
                </div>
              </div>
            </div>
          </div>
          </CollapsibleSection>
        </>
      )}

      {activeTab === "apps" && (
        <section>
          <h2 className="mb-4 text-lg font-semibold">All hosted sites & apps</h2>
          {apps.length === 0 ? (
            <p className="rounded-xl border border-[var(--border)] bg-[var(--card)] px-6 py-12 text-center text-[var(--muted)]">
              No detected apps.
            </p>
          ) : (
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
              {apps.map((app) => (
                <AppCard
                  key={`${app.port}-${app.name}`}
                  name={app.name}
                  port={app.port}
                  url={app.url}
                  process={app.process}
                />
              ))}
            </div>
          )}
        </section>
      )}

      {activeTab === "docker" && (
        <section>
          <h2 className="mb-4 text-lg font-semibold">Docker containers</h2>
          {dockerAvailable && dockerContainers.length > 0 && (
            <div className="mb-4 flex justify-end">
              <button
                onClick={() => {
                  const lines = dockerContainers.map((c) => `${c.name.padEnd(32)} ${c.status.padEnd(22)} ${c.ports.join(", ") || "—"}`);
                  const header = "NAMES".padEnd(32) + "STATUS".padEnd(22) + "PORTS\n" + "-".repeat(80) + "\n";
                  const snapshot = `# Snapshot ${new Date().toISOString().slice(0, 19)}\n${header}${lines.join("\n")}\n\n`;
                  setServicesNotes((prev) => snapshot + (prev ? "\n" + prev : ""));
                  setActiveTab("notes");
                }}
                className="rounded-lg border border-[var(--border)] px-3 py-1.5 text-sm hover:bg-[var(--border)]/50"
              >
                Add to Services Notes
              </button>
            </div>
          )}
          {!dockerAvailable ? (
            <div className="rounded-xl border border-[var(--border)] bg-[var(--card)] px-6 py-12">
              <p className="mb-4 text-center text-[var(--muted)]">
                Docker not available. Install Docker or ensure the panel has access to /var/run/docker.sock
              </p>
              <div className="flex justify-center">
                <button
                  onClick={() => installPackage("docker")}
                  disabled={installing !== null}
                  className="rounded-lg bg-[var(--accent)]/20 px-6 py-3 font-medium text-[var(--accent)] hover:bg-[var(--accent)]/30 disabled:opacity-50"
                >
                  {installing === "docker" ? "Installing…" : "One-Click Install Docker"}
                </button>
              </div>
              <p className="mt-3 text-center text-xs text-[var(--muted)]">
                Uses the official Docker install script. Requires sudo/root. Ubuntu/Debian recommended.
              </p>
            </div>
          ) : (
            <div className="overflow-hidden rounded-xl border border-[var(--border)] bg-[var(--card)]">
              <table className="w-full text-left text-sm">
                <thead className="bg-[var(--card)] text-[var(--muted)]">
                  <tr>
                    <th className="px-4 py-3 font-medium">Name</th>
                    <th className="px-4 py-3 font-medium">Image</th>
                    <th className="px-4 py-3 font-medium">State</th>
                    <th className="px-4 py-3 font-medium">Ports</th>
                    <th className="px-4 py-3 font-medium w-48">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {dockerContainers.map((c) => (
                    <tr key={c.id} className="border-t border-[var(--border)] hover:bg-[var(--border)]/50">
                      <td className="px-4 py-2 font-mono">{c.name}</td>
                      <td className="px-4 py-2 text-[var(--muted)]">{c.image}</td>
                      <td className="px-4 py-2">
                        <span className={`rounded px-2 py-0.5 text-xs ${
                          c.state === "running" ? "bg-emerald-500/20 text-emerald-400" : "bg-[var(--border)] text-[var(--muted)]"
                        }`}>
                          {c.state}
                        </span>
                      </td>
                      <td className="px-4 py-2 font-mono text-xs">{c.ports.join(", ") || "—"}</td>
                      <td className="px-4 py-2">
                        <div className="flex gap-1">
                          <button
                            onClick={() => dockerAction(c.id, "start")}
                            disabled={c.state === "running" || containerAction !== null}
                            className="rounded bg-emerald-500/20 px-2 py-1 text-xs text-emerald-400 hover:bg-emerald-500/30 disabled:opacity-50"
                          >
                            Start
                          </button>
                          <button
                            onClick={() => dockerAction(c.id, "stop")}
                            disabled={c.state !== "running" || containerAction !== null}
                            className="rounded bg-amber-500/20 px-2 py-1 text-xs text-amber-400 hover:bg-amber-500/30 disabled:opacity-50"
                          >
                            Stop
                          </button>
                          <button
                            onClick={() => dockerAction(c.id, "restart")}
                            disabled={containerAction !== null}
                            className="rounded bg-[var(--accent)]/20 px-2 py-1 text-xs text-[var(--accent)] hover:bg-[var(--accent)]/30 disabled:opacity-50"
                          >
                            Restart
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      )}

      {activeTab === "websites" && (
        <section className="grid gap-6 lg:grid-cols-3">
          <div className="lg:col-span-2">
            <h2 className="mb-4 text-lg font-semibold">Host websites</h2>
            <div className="mb-6 grid gap-5 rounded-2xl border border-[var(--border)] bg-[var(--card)] p-6 xl:grid-cols-[1.3fr_0.75fr]">
              <div>
                <p className="text-xs uppercase tracking-[0.18em] text-[var(--accent)]">
                  Create new site
                </p>
                <h3 className="mt-2 text-xl font-semibold">Guided website setup</h3>
                <p className="mt-2 text-sm leading-6 text-[var(--muted)]">
                  This flow was reshaped from the Stitch design to keep the first deploy simple:
                  choose a domain, pick the web stack, then optionally add DNS and SSL.
                </p>

                <div className="mt-5 grid gap-4 md:grid-cols-2">
                  <label className="block">
                    <span className="mb-2 block text-sm text-[var(--muted)]">Domain</span>
                    <input
                      type="text"
                      value={newDomain}
                      onChange={(e) => setNewDomain(e.target.value)}
                      placeholder="example.com"
                      className="w-full rounded-xl border border-[var(--border)] bg-[var(--background)] px-4 py-3 font-mono text-[var(--foreground)] focus:border-[var(--accent)] focus:outline-none"
                    />
                  </label>

                  <label className="block">
                    <span className="mb-2 block text-sm text-[var(--muted)]">Web server</span>
                    <select
                      value={newWebserver}
                      onChange={(e) => setNewWebserver(e.target.value as "nginx" | "ols")}
                      className="w-full rounded-xl border border-[var(--border)] bg-[var(--background)] px-4 py-3 text-[var(--foreground)]"
                    >
                      <option value="nginx">nginx</option>
                      <option value="ols">OpenLiteSpeed</option>
                    </select>
                  </label>
                </div>

                <div className="mt-4 grid gap-3 md:grid-cols-2">
                  <label className="rounded-xl border border-[var(--border)] p-4 text-sm">
                    <div className="flex items-start gap-3">
                      <input
                        type="checkbox"
                        checked={newWordpress}
                        onChange={(e) => setNewWordpress(e.target.checked)}
                        className="mt-1 rounded"
                      />
                      <div>
                        <p className="font-medium">WordPress in Docker</p>
                        <p className="mt-1 text-[var(--muted)]">
                          Use a containerized WordPress stack instead of a static placeholder site.
                        </p>
                      </div>
                    </div>
                  </label>

                  <label className="rounded-xl border border-[var(--border)] p-4 text-sm">
                    <div className="flex items-start gap-3">
                      <input
                        type="checkbox"
                        checked={newCreateDnsZone}
                        onChange={(e) => setNewCreateDnsZone(e.target.checked)}
                        className="mt-1 rounded"
                      />
                      <div>
                        <p className="font-medium">Create DNS zone</p>
                        <p className="mt-1 text-[var(--muted)]">
                          Add a bind9 zone here if the panel is also handling DNS for the domain.
                        </p>
                      </div>
                    </div>
                  </label>

                  <label className="rounded-xl border border-[var(--border)] p-4 text-sm md:col-span-2">
                    <div className="flex items-start gap-3">
                      <input
                        type="checkbox"
                        checked={newCreateSsl}
                        onChange={(e) => setNewCreateSsl(e.target.checked)}
                        className="mt-1 rounded"
                      />
                      <div>
                        <p className="font-medium">Issue SSL certificate</p>
                        <p className="mt-1 text-[var(--muted)]">
                          Use certbot during creation if DNS is already pointed at this server.
                        </p>
                      </div>
                    </div>
                  </label>
                </div>

                <div className="mt-5 rounded-xl border border-[var(--border)] bg-black/10 p-4 text-sm text-[var(--muted)]">
                  Point the domain at this server before requesting SSL. For WordPress,
                  Docker must be available. Static sites are scaffolded under `/var/www`.
                </div>

                <div className="mt-5">
                  <button
                    onClick={createWebsite}
                    disabled={creatingSite || !newDomain.trim()}
                    className="rounded-xl bg-[var(--accent)] px-5 py-3 font-medium text-slate-950 hover:bg-cyan-300 disabled:opacity-50"
                  >
                    {creatingSite ? "Creating…" : "Create Site"}
                  </button>
                </div>
              </div>

              <div className="rounded-2xl border border-[var(--border)] bg-black/10 p-5">
                <p className="text-xs uppercase tracking-[0.18em] text-[var(--muted)]">
                  Summary
                </p>
                <h4 className="mt-2 text-lg font-semibold text-[var(--foreground)]">
                  What this will create
                </h4>
                <div className="mt-4 space-y-3">
                  {createSiteSummary.map((line) => (
                    <div
                      key={line}
                      className="rounded-xl border border-[var(--border)] px-3 py-3 text-sm text-[var(--muted)]"
                    >
                      {line}
                    </div>
                  ))}
                </div>
              </div>
            </div>
            <h3 className="mb-3 font-medium">Existing sites</h3>
            <div className="rounded-xl border border-[var(--border)] bg-[var(--card)]">
              {websites.length === 0 ? (
                <p className="px-6 py-8 text-center text-sm text-[var(--muted)]">No sites yet.</p>
              ) : (
                <table className="w-full text-sm">
                  <thead className="text-[var(--muted)]">
                    <tr>
                      <th className="px-4 py-3 font-medium text-left">Domain</th>
                      <th className="px-4 py-3 font-medium text-left">Root</th>
                    </tr>
                  </thead>
                  <tbody>
                    {websites.map((s) => (
                      <tr
                        key={s.domain}
                        onClick={() => setSelectedWebsite(s.domain)}
                        className={`cursor-pointer border-t border-[var(--border)] hover:bg-[var(--border)]/50 ${selectedWebsite === s.domain ? "bg-[var(--accent)]/10" : ""}`}
                      >
                        <td className="px-4 py-2 font-mono">
                          <a href={`http://${s.domain}`} target="_blank" rel="noopener noreferrer" onClick={(e) => e.stopPropagation()} className="text-[var(--accent)] hover:underline">
                            {s.domain}
                          </a>
                        </td>
                        <td className="px-4 py-2 text-[var(--muted)]">{s.root}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </div>
          {selectedWebsite && websiteDetail && (
            <div className="rounded-xl border border-[var(--border)] bg-[var(--card)] p-5">
              <div className="mb-4 flex items-center justify-between">
                <h3 className="font-semibold">{websiteDetail.domain}</h3>
                <button onClick={() => setSelectedWebsite(null)} className="text-xs text-[var(--muted)] hover:underline">Close</button>
              </div>
              <dl className="mb-4 space-y-2 text-sm">
                <div><dt className="text-[var(--muted)]">Root</dt><dd className="font-mono text-xs">{websiteDetail.root}</dd></div>
                <div><dt className="text-[var(--muted)]">DNS zone</dt><dd>{websiteDetail.hasDnsZone ? <span className="text-emerald-400">✓</span> : <span className="text-amber-400">—</span>}</dd></div>
                <div><dt className="text-[var(--muted)]">SSL</dt><dd>{websiteDetail.sslCert ? <span className="text-emerald-400">✓ {websiteDetail.sslCert.expiry}</span> : <span className="text-amber-400">—</span>}</dd></div>
              </dl>
              <div className="flex flex-col gap-2">
                {!websiteDetail.hasDnsZone && (
                  <button
                    onClick={async () => {
                      setWebsiteDetailAction("dns");
                      const res = await fetch("/api/dns", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "create-zone", domain: websiteDetail.domain }) });
                      if (res.ok) { fetchWebsiteDetail(websiteDetail.domain); fetchDns(); }
                      else setError((await res.json()).error);
                      setWebsiteDetailAction(null);
                    }}
                    disabled={websiteDetailAction !== null}
                    className="rounded-lg border border-[var(--border)] px-3 py-2 text-left text-sm hover:bg-[var(--border)]/50 disabled:opacity-50"
                  >
                    {websiteDetailAction === "dns" ? "…" : "Create DNS zone"}
                  </button>
                )}
                {!websiteDetail.sslCert && (
                  <button
                    onClick={async () => {
                      setWebsiteDetailAction("ssl");
                      const res = await fetch("/api/ssl", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "issue", domain: websiteDetail.domain }) });
                      if (res.ok) fetchWebsiteDetail(websiteDetail.domain);
                      else setError((await res.json()).error);
                      setWebsiteDetailAction(null);
                    }}
                    disabled={websiteDetailAction !== null}
                    className="rounded-lg border border-[var(--border)] px-3 py-2 text-left text-sm hover:bg-[var(--border)]/50 disabled:opacity-50"
                  >
                    {websiteDetailAction === "ssl" ? "…" : "Issue SSL"}
                  </button>
                )}
                <button
                  onClick={() => { setActiveTab("files"); setFileManagerPath(websiteDetail.domain); }}
                  className="rounded-lg border border-[var(--border)] px-3 py-2 text-left text-sm hover:bg-[var(--border)]/50"
                >
                  Open in File Manager
                </button>
                <button
                  onClick={async () => {
                    setWebsiteDetailAction("backup");
                    const res = await fetch("/api/backups", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "create", site: websiteDetail.domain }) });
                    if (res.ok) fetchBackups();
                    else setError((await res.json()).error);
                    setWebsiteDetailAction(null);
                  }}
                  disabled={websiteDetailAction !== null}
                  className="rounded-lg border border-[var(--border)] px-3 py-2 text-left text-sm hover:bg-[var(--border)]/50 disabled:opacity-50"
                >
                  {websiteDetailAction === "backup" ? "…" : "Backup this site"}
                </button>
              </div>
            </div>
          )}
        </section>
      )}

      {activeTab === "firewall" && (
        <section>
          <h2 className="mb-4 text-lg font-semibold">Firewall (UFW)</h2>
          <div className="mb-4 flex flex-wrap items-center gap-3">
            <button
              onClick={async () => {
                const res = await fetch("/api/firewall", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: firewall?.enabled ? "disable" : "enable" }) });
                if (res.ok) fetchFirewall(); else setError((await res.json()).error);
              }}
              className={`rounded-lg px-4 py-2 text-sm font-medium ${firewall?.enabled ? "bg-red-500/20 text-red-400" : "bg-emerald-500/20 text-emerald-400"}`}
            >
              {firewall?.enabled ? "Disable" : "Enable"} UFW
            </button>
            <input
              value={firewallRule}
              onChange={(e) => setFirewallRule(e.target.value)}
              placeholder="allow 22/tcp"
              className="rounded-lg border border-[var(--border)] bg-[var(--background)] px-4 py-2 font-mono text-sm"
            />
            <button
              onClick={async () => {
                const res = await fetch("/api/firewall", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "add", rule: firewallRule }) });
                if (res.ok) { setFirewallRule(""); fetchFirewall(); } else setError((await res.json()).error);
              }}
              className="rounded-lg bg-[var(--accent)]/20 px-4 py-2 text-sm text-[var(--accent)]"
            >
              Add rule
            </button>
          </div>
          <div className="rounded-xl border border-[var(--border)] bg-[var(--card)]">
            <p className="border-b border-[var(--border)] px-4 py-2 text-sm text-[var(--muted)]">
              Status: {firewall?.enabled ? "Active" : "Inactive"}
            </p>
            <div className="max-h-64 overflow-y-auto">
              {firewall?.rules?.map((r) => (
                <div key={r.num} className="flex items-center justify-between border-b border-[var(--border)] px-4 py-2">
                  <span className="font-mono text-sm">{r.raw}</span>
                  <button
                    onClick={async () => {
                      const res = await fetch("/api/firewall", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "delete", number: r.num }) });
                      if (res.ok) fetchFirewall(); else setError((await res.json()).error);
                    }}
                    className="text-xs text-red-400 hover:underline"
                  >
                    Delete
                  </button>
                </div>
              ))}
            </div>
          </div>
        </section>
      )}

      {activeTab === "dns" && (
        <section>
          <h2 className="mb-4 text-lg font-semibold">DNS (bind9)</h2>
          <div className="mb-4 flex flex-wrap gap-3 rounded-xl border border-[var(--border)] bg-[var(--card)] p-4">
            <input value={newDnsZone} onChange={(e) => setNewDnsZone(e.target.value)} placeholder="example.com" className="rounded-lg border border-[var(--border)] bg-[var(--background)] px-4 py-2 font-mono" />
            <button
              onClick={async () => {
                const res = await fetch("/api/dns", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "create-zone", domain: newDnsZone }) });
                if (res.ok) { setNewDnsZone(""); fetchDns(); } else setError((await res.json()).error);
              }}
              className="rounded-lg bg-[var(--accent)]/20 px-4 py-2 text-sm text-[var(--accent)]"
            >
              Create zone
            </button>
          </div>
          <div className="mb-4 flex flex-wrap gap-2 rounded-xl border border-[var(--border)] bg-[var(--card)] p-4">
            <select value={newDnsRecord.zone} onChange={(e) => setNewDnsRecord((r) => ({ ...r, zone: e.target.value }))} className="rounded border border-[var(--border)] bg-[var(--background)] px-2 py-1">
              <option value="">Select zone</option>
              {dnsZones.map((z) => <option key={z.name} value={z.name}>{z.name}</option>)}
            </select>
            <input value={newDnsRecord.name} onChange={(e) => setNewDnsRecord((r) => ({ ...r, name: e.target.value }))} placeholder="name (@)" className="w-24 rounded border border-[var(--border)] bg-[var(--background)] px-2 py-1 font-mono" />
            <select value={newDnsRecord.type} onChange={(e) => setNewDnsRecord((r) => ({ ...r, type: e.target.value }))} className="rounded border border-[var(--border)] bg-[var(--background)] px-2 py-1">
              <option value="A">A</option>
              <option value="AAAA">AAAA</option>
              <option value="CNAME">CNAME</option>
              <option value="MX">MX</option>
              <option value="TXT">TXT</option>
              <option value="NS">NS</option>
            </select>
            <input value={newDnsRecord.value} onChange={(e) => setNewDnsRecord((r) => ({ ...r, value: e.target.value }))} placeholder="value" className="flex-1 min-w-[120px] rounded border border-[var(--border)] bg-[var(--background)] px-2 py-1 font-mono" />
            <button
              onClick={async () => {
                const res = await fetch("/api/dns", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "add-record", zone: newDnsRecord.zone, name: newDnsRecord.name || "@", type: newDnsRecord.type, value: newDnsRecord.value }) });
                if (res.ok) { setNewDnsRecord((r) => ({ ...r, value: "" })); fetchDns(); } else setError((await res.json()).error);
              }}
              className="rounded-lg bg-[var(--accent)]/20 px-4 py-2 text-sm text-[var(--accent)]"
            >
              Add record
            </button>
          </div>
          <div className="space-y-4">
            {dnsZones.map((z) => (
              <div key={z.name} className="rounded-xl border border-[var(--border)] bg-[var(--card)] p-4">
                <h3 className="mb-2 font-mono font-medium">{z.name}</h3>
                <div className="space-y-1 font-mono text-sm">
                  {z.records.map((r, i) => (
                    <div key={i} className="flex justify-between">
                      <span>{r}</span>
                      <button onClick={async () => { const res = await fetch("/api/dns", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "delete-record", zone: z.name, line: i }) }); if (res.ok) fetchDns(); }} className="text-red-400 text-xs">Del</button>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {activeTab === "ftp" && (
        <section>
          <h2 className="mb-4 text-lg font-semibold">FTP / SFTP users</h2>
          <div className="mb-4 flex flex-wrap gap-3 rounded-xl border border-[var(--border)] bg-[var(--card)] p-4">
            <input value={newFtpUser.username} onChange={(e) => setNewFtpUser((u) => ({ ...u, username: e.target.value }))} placeholder="Username" className="rounded-lg border border-[var(--border)] bg-[var(--background)] px-4 py-2" />
            <input type="password" value={newFtpUser.password} onChange={(e) => setNewFtpUser((u) => ({ ...u, password: e.target.value }))} placeholder="Password" className="rounded-lg border border-[var(--border)] bg-[var(--background)] px-4 py-2" />
            <button
              onClick={async () => {
                const res = await fetch("/api/ftp", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "create-user", username: newFtpUser.username, password: newFtpUser.password }) });
                if (res.ok) { setNewFtpUser({ username: "", password: "" }); fetchFtp(); } else setError((await res.json()).error);
              }}
              className="rounded-lg bg-[var(--accent)]/20 px-4 py-2 text-sm text-[var(--accent)]"
            >
              Create user
            </button>
          </div>
          <div className="rounded-xl border border-[var(--border)] bg-[var(--card)]">
            {ftpUsers.map((u) => (
              <div key={u.name} className="flex items-center justify-between border-b border-[var(--border)] px-4 py-2">
                <span className="font-mono">{u.name}</span>
                <span className="text-sm text-[var(--muted)]">{u.home}</span>
                <button onClick={async () => { const res = await fetch("/api/ftp", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "delete-user", username: u.name }) }); if (res.ok) fetchFtp(); else setError((await res.json()).error); }} className="text-xs text-red-400">Delete</button>
              </div>
            ))}
          </div>
        </section>
      )}

      {activeTab === "backups" && (
        <section>
          <h2 className="mb-4 text-lg font-semibold">Backups</h2>
          <div className="mb-4 flex flex-wrap items-center gap-3">
            <select
              id="backup-site"
              className="rounded-lg border border-[var(--border)] bg-[var(--background)] px-4 py-2 text-sm"
            >
              <option value="">All sites (/var/www + nginx)</option>
              {websites.map((s) => (
                <option key={s.domain} value={s.domain}>{s.domain}</option>
              ))}
            </select>
            <button
              onClick={async () => {
                setBackupCreating(true);
                const site = (document.getElementById("backup-site") as HTMLSelectElement)?.value || "";
                const res = await fetch("/api/backups", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "create", site: site || undefined }) });
                if (res.ok) fetchBackups(); else setError((await res.json()).error);
                setBackupCreating(false);
              }}
              disabled={backupCreating}
              className="rounded-lg bg-[var(--accent)]/20 px-4 py-2 text-sm font-medium text-[var(--accent)] disabled:opacity-50"
            >
              {backupCreating ? "Creating…" : "Create backup"}
            </button>
          </div>
          <div className="rounded-xl border border-[var(--border)] bg-[var(--card)]">
            {backups.map((b) => (
              <div key={b.name} className="flex items-center justify-between border-b border-[var(--border)] px-4 py-2">
                <span className="font-mono text-sm">{b.name}</span>
                <span className="text-sm text-[var(--muted)]">{(b.size / 1024 / 1024).toFixed(1)} MB · {new Date(b.mtime).toLocaleDateString()}</span>
                <div className="flex gap-2">
                  <button onClick={async () => { const res = await fetch("/api/backups", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "restore", filename: b.name }) }); if (res.ok) fetchBackups(); else setError((await res.json()).error); }} className="text-xs text-amber-400 hover:underline">Restore</button>
                  <button onClick={async () => { const res = await fetch("/api/backups", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "delete", filename: b.name }) }); if (res.ok) fetchBackups(); else setError((await res.json()).error); }} className="text-xs text-red-400 hover:underline">Delete</button>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {activeTab === "minecraft" && (
        <section className="max-w-2xl">
          <h2 className="mb-4 text-lg font-semibold">Minecraft server</h2>
          <div className="rounded-xl border border-[var(--border)] bg-[var(--card)] p-6">
            {!minecraft?.configured ? (
              <div className="space-y-4">
                <p className="text-[var(--muted)]">
                  Set <code className="rounded bg-[var(--border)] px-1 py-0.5 font-mono text-sm">MINECRAFT_SERVER_PATH</code> in{" "}
                  <code className="rounded bg-[var(--border)] px-1 py-0.5 font-mono text-sm">.env.local</code> to your server directory (e.g. <code className="font-mono">/opt/minecraft</code>).
                </p>
                <p className="text-sm text-[var(--muted)]">
                  The folder should contain <code className="font-mono">start.sh</code>, <code className="font-mono">run.sh</code>, or <code className="font-mono">server.jar</code>.
                </p>
              </div>
            ) : (
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="font-medium">
                      Status:{" "}
                      <span
                        className={
                          minecraft.running
                            ? "text-emerald-400"
                            : "text-[var(--muted)]"
                        }
                      >
                        {minecraft.running ? "Running" : "Stopped"}
                      </span>
                    </p>
                    <p className="text-sm text-[var(--muted)]">
                      Path: {minecraft.path} · Port {minecraft.port ?? 25565}
                    </p>
                  </div>
                  <div className="flex gap-2">
                    <button
                      onClick={() => minecraftAction("start")}
                      disabled={minecraft.running || mcAction !== null}
                      className="rounded-lg bg-emerald-500/20 px-4 py-2 text-sm font-medium text-emerald-400 hover:bg-emerald-500/30 disabled:opacity-50"
                    >
                      {mcAction === "start" ? "…" : "Start"}
                    </button>
                    <button
                      onClick={() => minecraftAction("stop")}
                      disabled={!minecraft.running || mcAction !== null}
                      className="rounded-lg bg-red-500/20 px-4 py-2 text-sm font-medium text-red-400 hover:bg-red-500/30 disabled:opacity-50"
                    >
                      {mcAction === "stop" ? "…" : "Stop"}
                    </button>
                    <button
                      onClick={() => minecraftAction("restart")}
                      disabled={mcAction !== null}
                      className="rounded-lg bg-amber-500/20 px-4 py-2 text-sm font-medium text-amber-400 hover:bg-amber-500/30 disabled:opacity-50"
                    >
                      {mcAction === "restart" ? "…" : "Restart"}
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>
        </section>
      )}

      {activeTab === "ssl" && (
        <section className="max-w-2xl">
          <h2 className="mb-4 text-lg font-semibold">SSL certificates (Certbot)</h2>
          <div className="rounded-xl border border-[var(--border)] bg-[var(--card)] p-6">
            {!ssl?.certbotInstalled ? (
              <div className="space-y-3">
                <p className="text-[var(--muted)]">
                  certbot not found. Install with one click or manually.
                </p>
                <button
                  onClick={() => installPackage("certbot")}
                  disabled={installing !== null}
                  className="rounded-lg bg-[var(--accent)]/20 px-4 py-2 text-sm font-medium text-[var(--accent)] hover:bg-[var(--accent)]/30 disabled:opacity-50"
                >
                  {installing === "certbot" ? "Installing…" : "One-Click Install Certbot"}
                </button>
              </div>
            ) : (
              <div className="space-y-4">
                <div className="flex justify-end">
                  <button
                    onClick={renewSsl}
                    disabled={sslRenewing}
                    className="rounded-lg bg-[var(--accent)]/20 px-4 py-2 text-sm font-medium text-[var(--accent)] hover:bg-[var(--accent)]/30 disabled:opacity-50"
                  >
                    {sslRenewing ? "Renewing…" : "Renew all"}
                  </button>
                </div>
                {ssl.certs.length === 0 ? (
                  <p className="text-[var(--muted)]">No certificates found.</p>
                ) : (
                  <table className="w-full text-sm">
                    <thead className="text-[var(--muted)]">
                      <tr>
                        <th className="px-4 py-2 text-left font-medium">Domain</th>
                        <th className="px-4 py-2 text-left font-medium">Expiry</th>
                      </tr>
                    </thead>
                    <tbody>
                      {ssl.certs.map((c) => (
                        <tr key={c.domain} className="border-t border-[var(--border)]">
                          <td className="px-4 py-2 font-mono">{c.domain}</td>
                          <td className="px-4 py-2 text-[var(--muted)]">{c.expiry}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
            )}
          </div>
        </section>
      )}

      {activeTab === "server" && (
        <section className="max-w-2xl">
          <h2 className="mb-4 text-lg font-semibold">Server control</h2>
          <div className="space-y-4">
            <div className="rounded-xl border border-[var(--border)] bg-[var(--card)] p-6">
              <h3 className="mb-3 font-medium">System info</h3>
              <dl className="space-y-2 text-sm">
                <div>
                  <dt className="text-[var(--muted)]">Hostname</dt>
                  <dd className="font-mono">{serverInfo?.hostname ?? "—"}</dd>
                </div>
                <div>
                  <dt className="text-[var(--muted)]">Uptime</dt>
                  <dd className="font-mono">{serverInfo?.uptime ?? "—"}</dd>
                </div>
                <div>
                  <dt className="text-[var(--muted)]">Kernel</dt>
                  <dd className="font-mono">{serverInfo?.kernel ?? "—"}</dd>
                </div>
              </dl>
            </div>
            <div className="rounded-xl border border-[var(--border)] bg-[var(--card)] p-6">
              <h3 className="mb-3 font-medium">Services</h3>
              {!installStatus?.nginx?.installed ? (
                <div className="space-y-3">
                  <p className="text-sm text-[var(--muted)]">nginx not detected.</p>
                  <button
                    onClick={() => installPackage("nginx")}
                    disabled={installing !== null}
                    className="rounded-lg bg-[var(--accent)]/20 px-4 py-2 text-sm font-medium text-[var(--accent)] hover:bg-[var(--accent)]/30 disabled:opacity-50"
                  >
                    {installing === "nginx" ? "Installing…" : "One-Click Install nginx"}
                  </button>
                </div>
              ) : (
                <>
                  <div className="flex gap-2">
                    <button
                      onClick={() => serverAction("reload-nginx")}
                      className="rounded-lg bg-[var(--accent)]/20 px-4 py-2 text-sm font-medium text-[var(--accent)] hover:bg-[var(--accent)]/30"
                    >
                      Reload nginx
                    </button>
                    <button
                      onClick={() => serverAction("restart-nginx")}
                      className="rounded-lg bg-amber-500/20 px-4 py-2 text-sm font-medium text-amber-400 hover:bg-amber-500/30"
                    >
                      Restart nginx
                    </button>
                  </div>
                  <p className="mt-2 text-xs text-[var(--muted)]">
                    Use after SSL renewal or config changes.
                  </p>
                </>
              )}
            </div>
          </div>
        </section>
      )}

      {activeTab === "actions" && (
        <section>
          <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="text-lg font-semibold">Safe Actions</h2>
              <p className="mt-1 text-sm text-[var(--muted)]">
                Run approved operational commands from the panel without exposing an unrestricted shell.
              </p>
            </div>
            <button
              onClick={fetchSafeActions}
              className="rounded-xl border border-[var(--border)] px-4 py-2 text-sm hover:bg-[var(--border)]/50"
            >
              Refresh catalog
            </button>
          </div>

          <div className="mb-6 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {safeActions.map((action) => (
              <div
                key={action.id}
                className="rounded-2xl border border-[var(--border)] bg-[var(--card)] p-5"
              >
                <h3 className="text-base font-semibold">{action.label}</h3>
                <p className="mt-2 text-sm text-[var(--muted)]">{action.description}</p>
                <button
                  onClick={() => runSafeAction(action)}
                  disabled={actionRunning !== null}
                  className="mt-4 rounded-xl bg-[var(--accent)] px-4 py-2 text-sm font-medium text-slate-950 hover:bg-cyan-300 disabled:opacity-50"
                >
                  {actionRunning === action.id ? "Running…" : "Run"}
                </button>
              </div>
            ))}
          </div>

          <div className="rounded-2xl border border-[var(--border)] bg-[var(--card)] p-5">
            <div className="mb-3 flex items-center justify-between">
              <h3 className="text-base font-semibold">
                {actionOutput?.label || "Command output"}
              </h3>
              <button
                onClick={() => setActionOutput(null)}
                className="text-xs text-[var(--muted)] hover:underline"
              >
                Clear
              </button>
            </div>
            <pre className="min-h-[360px] overflow-auto rounded-xl border border-[var(--border)] bg-[var(--background)] p-4 text-xs text-[var(--foreground)]">
              {actionOutput?.output ||
                "Select an approved action to inspect live operational output here."}
            </pre>
          </div>
        </section>
      )}

      {activeTab === "installs" && (
        <section>
          <h2 className="mb-4 text-lg font-semibold">One-Click Installs</h2>
          <p className="mb-6 text-sm text-[var(--muted)]">
            Install common server dependencies with one click. Requires sudo/root. Ubuntu/Debian recommended.
          </p>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {installStatus && (
              <>
                {(["docker", "nginx", "certbot"] as const).map((pkg) => {
                  const s = installStatus[pkg];
                  const desc =
                    pkg === "docker"
                      ? "Container runtime for WordPress, apps, and more"
                      : pkg === "nginx"
                        ? "Web server for hosting sites"
                        : "SSL certificates via Let's Encrypt";
                  return (
                    <div
                      key={pkg}
                      className="flex flex-col rounded-xl border border-[var(--border)] bg-[var(--card)] p-5"
                    >
                      <div className="mb-2 flex items-center justify-between">
                        <h3 className="font-semibold">{s.name}</h3>
                        <span
                          className={`rounded px-2 py-0.5 text-xs ${
                            s.installed
                              ? "bg-emerald-500/20 text-emerald-400"
                              : "bg-amber-500/20 text-amber-400"
                          }`}
                        >
                          {s.installed ? "Installed" : "Not installed"}
                        </span>
                      </div>
                      <p className="mb-4 flex-1 text-sm text-[var(--muted)]">
                        {desc}
                      </p>
                      <button
                        onClick={() => installPackage(pkg)}
                        disabled={s.installed || installing !== null}
                        className="rounded-lg bg-[var(--accent)]/20 px-4 py-2 text-sm font-medium text-[var(--accent)] hover:bg-[var(--accent)]/30 disabled:opacity-50"
                      >
                        {installing === pkg
                          ? "Installing…"
                          : s.installed
                            ? "Installed"
                            : `Install ${s.name}`}
                      </button>
                    </div>
                  );
                })}
              </>
            )}
          </div>
        </section>
      )}

      {activeTab === "audit" && (
        <section>
          <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="text-lg font-semibold">Audit Trail</h2>
              <p className="mt-1 text-sm text-[var(--muted)]">
                Review recent administrative activity and privileged operations executed from the panel.
              </p>
            </div>
            <button
              onClick={fetchAuditEntries}
              className="rounded-xl border border-[var(--border)] px-4 py-2 text-sm hover:bg-[var(--border)]/50"
            >
              Refresh audit log
            </button>
          </div>

          <div className="rounded-2xl border border-[var(--border)] bg-[var(--card)]">
            {auditEntries.length === 0 ? (
              <p className="px-6 py-10 text-center text-sm text-[var(--muted)]">
                No audit events recorded yet.
              </p>
            ) : (
              <div className="divide-y divide-[var(--border)]">
                {auditEntries.map((entry, index) => (
                  <div
                    key={`${entry.timestamp}-${entry.action}-${index}`}
                    className="flex flex-col gap-3 px-5 py-4 md:flex-row md:items-start md:justify-between"
                  >
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="font-medium">{entry.action}</p>
                        <span
                          className={cx(
                            "rounded-full px-2.5 py-1 text-xs",
                            entry.outcome === "success"
                              ? "bg-emerald-500/15 text-emerald-300"
                              : "bg-red-500/15 text-red-300"
                          )}
                        >
                          {entry.outcome}
                        </span>
                      </div>
                      <p className="mt-1 text-sm text-[var(--muted)]">
                        {new Date(entry.timestamp).toLocaleString()} by {entry.actor}
                      </p>
                      {entry.details && Object.keys(entry.details).length > 0 && (
                        <div className="mt-3 flex flex-wrap gap-2">
                          {Object.entries(entry.details).map(([key, value]) => (
                            <span
                              key={key}
                              className="rounded-full border border-[var(--border)] px-2.5 py-1 text-xs text-[var(--muted)]"
                            >
                              {key}: {String(value)}
                            </span>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </section>
      )}

      {activeTab === "files" && (
        <section>
          <h2 className="mb-4 text-lg font-semibold">File Manager</h2>
          <p className="mb-4 text-sm text-[var(--muted)]">
            Browse, upload, and manage files. Root: <code className="rounded bg-[var(--border)] px-1 py-0.5 font-mono text-xs">/var/www</code> (set FILE_MANAGER_ROOT to change)
          </p>
          <div className="mb-4 flex flex-wrap items-center gap-2">
            <button
              onClick={() => {
                const up = fileManagerPath.split("/").filter(Boolean).slice(0, -1).join("/");
                setFileManagerPath(up);
              }}
              disabled={!fileManagerPath}
              className="rounded-lg border border-[var(--border)] px-3 py-1.5 text-sm hover:bg-[var(--border)]/50 disabled:opacity-50"
            >
              ↑ Up
            </button>
            <span className="font-mono text-sm text-[var(--muted)]">
              /{fileManagerPath || "(root)"}
            </span>
          </div>
          <div className="mb-4 flex flex-wrap gap-2">
            <input
              value={newDirName}
              onChange={(e) => setNewDirName(e.target.value)}
              placeholder="New folder name"
              className="rounded-lg border border-[var(--border)] bg-[var(--background)] px-3 py-1.5 text-sm"
            />
            <button
              onClick={async () => {
                if (!newDirName.trim()) return;
                const res = await fetch("/api/files/mkdir", {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({ path: fileManagerPath, name: newDirName.trim() }),
                });
                if (res.ok) {
                  setNewDirName("");
                  fetchFileManager(fileManagerPath);
                } else setError((await res.json()).error);
              }}
              className="rounded-lg bg-[var(--accent)]/20 px-3 py-1.5 text-sm text-[var(--accent)]"
            >
              New folder
            </button>
            <label className="cursor-pointer rounded-lg border border-[var(--border)] px-3 py-1.5 text-sm hover:bg-[var(--border)]/50">
              {uploadingFile ? "Uploading…" : "Upload"}
              <input
                type="file"
                className="hidden"
                onChange={async (e) => {
                  const f = e.target.files?.[0];
                  if (!f) return;
                  setUploadingFile(true);
                  const fd = new FormData();
                  fd.set("path", fileManagerPath);
                  fd.set("file", f);
                  const res = await fetch("/api/files/upload", { method: "POST", body: fd });
                  if (res.ok) fetchFileManager(fileManagerPath);
                  else setError((await res.json()).error);
                  setUploadingFile(false);
                  e.target.value = "";
                }}
              />
            </label>
          </div>
          <div className="rounded-xl border border-[var(--border)] bg-[var(--card)]">
            {fileManagerLoading ? (
              <p className="px-6 py-8 text-center text-[var(--muted)]">Loading…</p>
            ) : (
              <div className="divide-y divide-[var(--border)]">
                {fileManagerItems.map((item) => (
                  <div
                    key={item.name}
                    className="flex items-center justify-between gap-4 px-4 py-2 hover:bg-[var(--border)]/50"
                  >
                    <button
                      onClick={() =>
                        item.type === "dir"
                          ? setFileManagerPath(fileManagerPath ? `${fileManagerPath}/${item.name}` : item.name)
                          : fetch(`/api/files/read?path=${encodeURIComponent(fileManagerPath ? `${fileManagerPath}/${item.name}` : item.name)}`)
                              .then((r) => r.json())
                              .then((d) => d.content != null ? setFilePreview({ path: item.name, content: d.content }) : setError(d.error))
                              .catch(() => setError("Failed to read file"))
                      }
                      className="flex flex-1 items-center gap-2 text-left"
                    >
                      <span className="text-lg">{item.type === "dir" ? "📁" : "📄"}</span>
                      <span className="font-mono text-sm">{item.name}</span>
                      {item.size != null && (
                        <span className="text-xs text-[var(--muted)]">
                          {(item.size / 1024).toFixed(1)} KB
                        </span>
                      )}
                    </button>
                    <button
                      onClick={async () => {
                        if (!confirm(`Delete ${item.name}?`)) return;
                        const res = await fetch("/api/files/delete", {
                          method: "POST",
                          headers: { "Content-Type": "application/json" },
                          body: JSON.stringify({ path: fileManagerPath ? `${fileManagerPath}/${item.name}` : item.name }),
                        });
                        if (res.ok) fetchFileManager(fileManagerPath);
                        else setError((await res.json()).error);
                      }}
                      className="rounded px-2 py-1 text-xs text-red-400 hover:bg-red-500/20"
                    >
                      Delete
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
          {filePreview && (
            <div className="fixed inset-4 z-50 flex flex-col rounded-xl border border-[var(--border)] bg-[var(--card)] p-4 shadow-xl">
              <div className="mb-2 flex items-center justify-between">
                <span className="font-mono text-sm">{filePreview.path}</span>
                <button
                  onClick={() => setFilePreview(null)}
                  className="rounded px-2 py-1 text-sm text-[var(--muted)] hover:bg-[var(--border)]"
                >
                  Close
                </button>
              </div>
              <pre className="flex-1 overflow-auto rounded border border-[var(--border)] bg-[var(--background)] p-4 text-xs">
                {filePreview.content}
              </pre>
            </div>
          )}
        </section>
      )}

      {activeTab === "integrations" && (
        <section>
          <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="text-lg font-semibold">Integrations</h2>
              <p className="mt-1 text-sm text-[var(--muted)]">
                Register self-hosted apps like Immich, Nextcloud, Grafana, and any custom service.
                The panel checks their health live on refresh.
              </p>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={fetchIntegrations}
                className="rounded-xl border border-[var(--border)] px-4 py-2 text-sm hover:bg-[var(--border)]/50"
              >
                Refresh
              </button>
              <button
                onClick={() => saveIntegrations(integrations)}
                disabled={integrationsSaving}
                className="rounded-xl bg-[var(--accent)] px-4 py-2 text-sm font-medium text-slate-950 hover:bg-cyan-300 disabled:opacity-50"
              >
                {integrationsSaving ? "Saving…" : "Save Integrations"}
              </button>
            </div>
          </div>

          <div className="mb-6 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            <MetricCard
              label="Enabled"
              value={`${enabledIntegrations.length}`}
              meta={`${integrations.length} integration profiles`}
              toneClass="text-[var(--accent)]"
            />
            <MetricCard
              label="Healthy"
              value={`${integrations.filter((item) => item.status === "healthy").length}`}
              meta="Services responding to health checks"
              toneClass="text-emerald-400"
            />
            <MetricCard
              label="Offline"
              value={`${integrations.filter((item) => item.enabled && item.status === "offline").length}`}
              meta="Enabled services not responding"
              toneClass="text-amber-400"
            />
            <MetricCard
              label="Polling"
              value={`${Math.round(livePollMs / 1000)}s`}
              meta="Uses the dashboard live refresh interval"
              toneClass="text-violet-400"
            />
          </div>

          <div className="grid gap-4 lg:grid-cols-2 xl:grid-cols-3">
            {integrations.map((integration) => (
              <div
                key={integration.id}
                className="rounded-2xl border border-[var(--border)] bg-[var(--card)] p-5"
              >
                <div className="flex items-start justify-between gap-4">
                  <div className="flex items-center gap-3">
                    <div className="flex h-11 w-11 items-center justify-center rounded-2xl border border-[var(--border)] bg-black/20 text-sm font-semibold text-[var(--accent)]">
                      {integration.icon}
                    </div>
                    <div>
                      <h3 className="font-semibold">{integration.name}</h3>
                      <p className="text-sm text-[var(--muted)]">{integration.description}</p>
                    </div>
                  </div>
                  <span
                    className={cx(
                      "rounded-full px-2.5 py-1 text-xs",
                      integration.status === "healthy"
                        ? "bg-emerald-500/15 text-emerald-300"
                        : integration.status === "offline"
                          ? "bg-amber-500/15 text-amber-300"
                          : "bg-[var(--border)] text-[var(--muted)]"
                    )}
                  >
                    {integration.status}
                  </span>
                </div>

                <div className="mt-4 space-y-3">
                  <label className="flex items-center justify-between rounded-xl border border-[var(--border)] px-3 py-3 text-sm">
                    <span>Enable integration</span>
                    <input
                      type="checkbox"
                      checked={integration.enabled}
                      onChange={(e) => updateIntegration(integration.id, "enabled", e.target.checked)}
                      className="rounded"
                    />
                  </label>

                  <label className="block">
                    <span className="mb-2 block text-xs uppercase tracking-[0.18em] text-[var(--muted)]">
                      App URL
                    </span>
                    <input
                      value={integration.url}
                      onChange={(e) => updateIntegration(integration.id, "url", e.target.value)}
                      placeholder="http://localhost:3000"
                      className="w-full rounded-xl border border-[var(--border)] bg-[var(--background)] px-3 py-2 text-sm"
                    />
                  </label>

                  <div className="grid gap-3 md:grid-cols-2">
                    <label className="block">
                      <span className="mb-2 block text-xs uppercase tracking-[0.18em] text-[var(--muted)]">
                        Health URL
                      </span>
                      <input
                        value={integration.healthUrl}
                        onChange={(e) => updateIntegration(integration.id, "healthUrl", e.target.value)}
                        placeholder="http://localhost:3000/health"
                        className="w-full rounded-xl border border-[var(--border)] bg-[var(--background)] px-3 py-2 text-sm"
                      />
                    </label>
                    <label className="block">
                      <span className="mb-2 block text-xs uppercase tracking-[0.18em] text-[var(--muted)]">
                        Port
                      </span>
                      <input
                        value={integration.port}
                        onChange={(e) => updateIntegration(integration.id, "port", e.target.value)}
                        placeholder="3000"
                        className="w-full rounded-xl border border-[var(--border)] bg-[var(--background)] px-3 py-2 text-sm"
                      />
                    </label>
                  </div>
                </div>

                <div className="mt-4 flex items-center justify-between gap-3">
                  <span className="text-xs text-[var(--muted)]">
                    Category: {integration.category}
                  </span>
                  {integration.url ? (
                    <a
                      href={integration.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-sm text-[var(--accent)] hover:underline"
                    >
                      Open app
                    </a>
                  ) : (
                    <span className="text-xs text-[var(--muted)]">Add a URL to open it</span>
                  )}
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {activeTab === "settings" && panelSettings && (
        <section>
          <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="text-lg font-semibold">Settings</h2>
              <p className="mt-1 text-sm text-[var(--muted)]">
                Tune live refresh, dashboard density, server defaults, and security preferences
                without editing files by hand.
              </p>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={fetchSettings}
                className="rounded-xl border border-[var(--border)] px-4 py-2 text-sm hover:bg-[var(--border)]/50"
              >
                Reload
              </button>
              <button
                onClick={saveSettings}
                disabled={settingsSaving}
                className="rounded-xl bg-[var(--accent)] px-4 py-2 text-sm font-medium text-slate-950 hover:bg-cyan-300 disabled:opacity-50"
              >
                {settingsSaving ? "Saving…" : "Save Settings"}
              </button>
            </div>
          </div>

          <div className="grid gap-5 xl:grid-cols-[1fr_1fr]">
            <div className="space-y-5">
              <div className="rounded-2xl border border-[var(--border)] bg-[var(--card)] p-5">
                <h3 className="text-base font-semibold">Dashboard Preferences</h3>
                <div className="mt-4 grid gap-4 md:grid-cols-2">
                  <label className="block">
                    <span className="mb-2 block text-sm text-[var(--muted)]">Polling interval</span>
                    <select
                      value={panelSettings.dashboard.pollingIntervalMs}
                      onChange={(e) =>
                        setPanelSettings((prev) =>
                          prev
                            ? {
                                ...prev,
                                dashboard: {
                                  ...prev.dashboard,
                                  pollingIntervalMs: Number(e.target.value),
                                },
                              }
                            : prev
                        )
                      }
                      className="w-full rounded-xl border border-[var(--border)] bg-[var(--background)] px-4 py-3 text-sm"
                    >
                      <option value={2000}>2 seconds</option>
                      <option value={3000}>3 seconds</option>
                      <option value={5000}>5 seconds</option>
                      <option value={10000}>10 seconds</option>
                      <option value={15000}>15 seconds</option>
                    </select>
                  </label>
                  <div className="rounded-xl border border-[var(--border)] bg-black/10 px-4 py-3">
                    <p className="text-sm font-medium">Current behavior</p>
                    <p className="mt-2 text-sm text-[var(--muted)]">
                      Live metrics update every {Math.round(panelSettings.dashboard.pollingIntervalMs / 1000)}s.
                    </p>
                  </div>
                </div>

                <div className="mt-4 space-y-3">
                  {[
                    {
                      label: "Show GPU metrics",
                      field: "showGpu" as const,
                      description: "Display GPU card and telemetry when hardware data is available.",
                    },
                    {
                      label: "Show process table",
                      field: "showProcessTable" as const,
                      description: "Keep the live process list visible on the overview page.",
                    },
                    {
                      label: "Compact mode",
                      field: "compactMode" as const,
                      description: "Tighten spacing across the dashboard for denser monitoring.",
                    },
                  ].map((item) => (
                    <label
                      key={item.field}
                      className="flex items-start justify-between gap-4 rounded-xl border border-[var(--border)] px-4 py-3"
                    >
                      <div>
                        <p className="font-medium">{item.label}</p>
                        <p className="mt-1 text-sm text-[var(--muted)]">{item.description}</p>
                      </div>
                      <input
                        type="checkbox"
                        checked={panelSettings.dashboard[item.field]}
                        onChange={(e) =>
                          setPanelSettings((prev) =>
                            prev
                              ? {
                                  ...prev,
                                  dashboard: {
                                    ...prev.dashboard,
                                    [item.field]: e.target.checked,
                                  },
                                }
                              : prev
                          )
                        }
                        className="mt-1 rounded"
                      />
                    </label>
                  ))}
                </div>
              </div>

              <div className="rounded-2xl border border-[var(--border)] bg-[var(--card)] p-5">
                <h3 className="text-base font-semibold">Server Defaults</h3>
                <div className="mt-4 grid gap-4">
                  <label className="block">
                    <span className="mb-2 block text-sm text-[var(--muted)]">Default web server</span>
                    <select
                      value={panelSettings.defaults.webserver}
                      onChange={(e) =>
                        setPanelSettings((prev) =>
                          prev
                            ? {
                                ...prev,
                                defaults: {
                                  ...prev.defaults,
                                  webserver: e.target.value === "ols" ? "ols" : "nginx",
                                },
                              }
                            : prev
                        )
                      }
                      className="w-full rounded-xl border border-[var(--border)] bg-[var(--background)] px-4 py-3 text-sm"
                    >
                      <option value="nginx">nginx</option>
                      <option value="ols">OpenLiteSpeed</option>
                    </select>
                  </label>
                  <label className="block">
                    <span className="mb-2 block text-sm text-[var(--muted)]">Backup directory label</span>
                    <input
                      value={panelSettings.defaults.backupDirectoryLabel}
                      onChange={(e) =>
                        setPanelSettings((prev) =>
                          prev
                            ? {
                                ...prev,
                                defaults: {
                                  ...prev.defaults,
                                  backupDirectoryLabel: e.target.value,
                                },
                              }
                            : prev
                        )
                      }
                      className="w-full rounded-xl border border-[var(--border)] bg-[var(--background)] px-4 py-3 text-sm"
                    />
                  </label>
                  <label className="block">
                    <span className="mb-2 block text-sm text-[var(--muted)]">File manager root label</span>
                    <input
                      value={panelSettings.defaults.fileManagerRootLabel}
                      onChange={(e) =>
                        setPanelSettings((prev) =>
                          prev
                            ? {
                                ...prev,
                                defaults: {
                                  ...prev.defaults,
                                  fileManagerRootLabel: e.target.value,
                                },
                              }
                            : prev
                        )
                      }
                      className="w-full rounded-xl border border-[var(--border)] bg-[var(--background)] px-4 py-3 text-sm"
                    />
                  </label>
                </div>
              </div>
            </div>

            <div className="space-y-5">
              <div className="rounded-2xl border border-[var(--border)] bg-[var(--card)] p-5">
                <h3 className="text-base font-semibold">Security Preferences</h3>
                <div className="mt-4 grid gap-4">
                  <label className="block">
                    <span className="mb-2 block text-sm text-[var(--muted)]">SSH port</span>
                    <input
                      value={panelSettings.security.sshPort}
                      onChange={(e) =>
                        setPanelSettings((prev) =>
                          prev
                            ? {
                                ...prev,
                                security: {
                                  ...prev.security,
                                  sshPort: e.target.value,
                                },
                              }
                            : prev
                        )
                      }
                      className="w-full rounded-xl border border-[var(--border)] bg-[var(--background)] px-4 py-3 text-sm"
                    />
                  </label>

                  {[
                    {
                      label: "Fail2Ban enabled",
                      field: "fail2banEnabled" as const,
                      description: "Track whether brute-force protection is part of your server baseline.",
                    },
                  ].map((item) => (
                    <label
                      key={item.field}
                      className="flex items-start justify-between gap-4 rounded-xl border border-[var(--border)] px-4 py-3"
                    >
                      <div>
                        <p className="font-medium">{item.label}</p>
                        <p className="mt-1 text-sm text-[var(--muted)]">{item.description}</p>
                      </div>
                      <input
                        type="checkbox"
                        checked={panelSettings.security[item.field]}
                        onChange={(e) =>
                          setPanelSettings((prev) =>
                            prev
                              ? {
                                  ...prev,
                                  security: {
                                    ...prev.security,
                                    [item.field]: e.target.checked,
                                  },
                                }
                              : prev
                          )
                        }
                        className="mt-1 rounded"
                      />
                    </label>
                  ))}
                </div>
              </div>

              <div className="rounded-2xl border border-[var(--border)] bg-[var(--card)] p-5">
                <h3 className="text-base font-semibold">Authenticator 2FA</h3>
                <p className="mt-2 text-sm text-[var(--muted)]">
                  Use Microsoft Authenticator or any TOTP-compatible app for a second login factor.
                </p>

                <div className="mt-4 rounded-xl border border-[var(--border)] px-4 py-3">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <p className="font-medium">Current status</p>
                      <p className="text-sm text-[var(--muted)]">
                        {twoFactorState?.enabled ? "Enabled" : twoFactorState?.setupPending ? "Setup pending" : "Disabled"}
                      </p>
                    </div>
                    <span
                      className={cx(
                        "rounded-full px-2.5 py-1 text-xs",
                        twoFactorState?.enabled
                          ? "bg-emerald-500/15 text-emerald-300"
                          : twoFactorState?.setupPending
                            ? "bg-amber-500/15 text-amber-300"
                            : "bg-[var(--border)] text-[var(--muted)]"
                      )}
                    >
                      {twoFactorState?.enabled ? "Protected" : twoFactorState?.setupPending ? "Pending" : "Inactive"}
                    </span>
                  </div>
                </div>

                <div className="mt-4 grid gap-4 md:grid-cols-2">
                  <label className="block">
                    <span className="mb-2 block text-sm text-[var(--muted)]">Issuer</span>
                    <input
                      value={twoFactorForm.issuer}
                      onChange={(e) =>
                        setTwoFactorForm((prev) => ({ ...prev, issuer: e.target.value }))
                      }
                      className="w-full rounded-xl border border-[var(--border)] bg-[var(--background)] px-4 py-3 text-sm"
                    />
                  </label>
                  <label className="block">
                    <span className="mb-2 block text-sm text-[var(--muted)]">Account label</span>
                    <input
                      value={twoFactorForm.label}
                      onChange={(e) =>
                        setTwoFactorForm((prev) => ({ ...prev, label: e.target.value }))
                      }
                      className="w-full rounded-xl border border-[var(--border)] bg-[var(--background)] px-4 py-3 text-sm"
                    />
                  </label>
                </div>

                <div className="mt-4 grid gap-4 md:grid-cols-2">
                  <label className="block">
                    <span className="mb-2 block text-sm text-[var(--muted)]">Current password</span>
                    <input
                      type="password"
                      value={twoFactorForm.password}
                      onChange={(e) =>
                        setTwoFactorForm((prev) => ({ ...prev, password: e.target.value }))
                      }
                      className="w-full rounded-xl border border-[var(--border)] bg-[var(--background)] px-4 py-3 text-sm"
                    />
                  </label>
                  <label className="block">
                    <span className="mb-2 block text-sm text-[var(--muted)]">Authenticator code</span>
                    <input
                      value={twoFactorForm.code}
                      inputMode="numeric"
                      onChange={(e) =>
                        setTwoFactorForm((prev) => ({
                          ...prev,
                          code: e.target.value.replace(/\D/g, "").slice(0, 6),
                        }))
                      }
                      placeholder="6-digit code"
                      className="w-full rounded-xl border border-[var(--border)] bg-[var(--background)] px-4 py-3 text-sm"
                    />
                  </label>
                </div>

                {twoFactorSetupSecret && (
                  <div className="mt-4 rounded-xl border border-[var(--border)] bg-black/10 p-4">
                    <p className="text-sm font-medium">Setup secret</p>
                    <p className="mt-2 break-all font-mono text-sm text-[var(--accent)]">
                      {twoFactorSetupSecret}
                    </p>
                    <p className="mt-3 text-xs text-[var(--muted)]">
                      Microsoft Authenticator supports manual TOTP entry. Add a new account, choose
                      to enter a setup key, and use the secret above.
                    </p>
                    {twoFactorOtpAuthUri && (
                      <p className="mt-3 break-all text-xs text-[var(--muted)]">
                        otpauth URI: {twoFactorOtpAuthUri}
                      </p>
                    )}
                  </div>
                )}

                <div className="mt-4 flex flex-wrap gap-3">
                  <button
                    onClick={startTwoFactorSetup}
                    disabled={twoFactorLoading || twoFactorState?.enabled === true}
                    className="rounded-xl bg-[var(--accent)] px-4 py-2 text-sm font-medium text-slate-950 hover:bg-cyan-300 disabled:opacity-50"
                  >
                    {twoFactorLoading ? "Working…" : "Start 2FA setup"}
                  </button>
                  <button
                    onClick={confirmTwoFactorSetup}
                    disabled={twoFactorLoading || !twoFactorState?.setupPending}
                    className="rounded-xl border border-[var(--border)] px-4 py-2 text-sm hover:bg-[var(--border)]/50 disabled:opacity-50"
                  >
                    Confirm setup
                  </button>
                  <button
                    onClick={disableTwoFactor}
                    disabled={twoFactorLoading || !twoFactorState?.enabled}
                    className="rounded-xl border border-red-500/30 px-4 py-2 text-sm text-red-300 hover:bg-red-500/10 disabled:opacity-50"
                  >
                    Disable 2FA
                  </button>
                </div>
              </div>

              <div className="rounded-2xl border border-[var(--border)] bg-[var(--card)] p-5">
                <h3 className="text-base font-semibold">Connected App Surface</h3>
                <div className="mt-4 space-y-3">
                  {enabledIntegrations.length === 0 ? (
                    <p className="rounded-xl border border-dashed border-[var(--border)] px-4 py-6 text-sm text-[var(--muted)]">
                      No integrations enabled yet. Add Immich, Nextcloud, Grafana, Portainer, or a custom app in the integrations tab.
                    </p>
                  ) : (
                    enabledIntegrations.map((integration) => (
                      <div
                        key={integration.id}
                        className="flex items-center justify-between gap-4 rounded-xl border border-[var(--border)] px-4 py-3"
                      >
                        <div>
                          <p className="font-medium">{integration.name}</p>
                          <p className="text-sm text-[var(--muted)]">
                            {integration.url || "No URL configured"}
                          </p>
                        </div>
                        <span
                          className={cx(
                            "rounded-full px-2.5 py-1 text-xs",
                            integration.status === "healthy"
                              ? "bg-emerald-500/15 text-emerald-300"
                              : "bg-amber-500/15 text-amber-300"
                          )}
                        >
                          {integration.status}
                        </span>
                      </div>
                    ))
                  )}
                </div>
                <button
                  onClick={() => setActiveTab("integrations")}
                  className="mt-4 rounded-xl border border-[var(--border)] px-4 py-2 text-sm hover:bg-[var(--border)]/50"
                >
                  Open Integrations
                </button>
              </div>
            </div>
          </div>
        </section>
      )}

      {activeTab === "notes" && (
        <section>
          <h2 className="mb-4 text-lg font-semibold">Services Notes</h2>
          <p className="mb-4 text-sm text-[var(--muted)]">
            Keep a notepad of your containers and services. Use &quot;Copy from Docker&quot; to snapshot current state. Handy when things go down or don&apos;t register.
          </p>
          <div className="mb-4 flex flex-wrap gap-2">
            <button
              onClick={async () => {
                setNotesSaving(true);
                try {
                  const res = await fetch("/api/notes", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ content: servicesNotes }),
                  });
                  if (res.ok) setNotesLastSaved(new Date().toLocaleTimeString());
                  else setError((await res.json()).error);
                } finally {
                  setNotesSaving(false);
                }
              }}
              disabled={notesSaving}
              className="rounded-lg bg-[var(--accent)]/20 px-4 py-2 text-sm font-medium text-[var(--accent)] hover:bg-[var(--accent)]/30 disabled:opacity-50"
            >
              {notesSaving ? "Saving…" : "Save"}
            </button>
            <button
              onClick={() => {
                const lines = dockerContainers.map(
                  (c) => `${c.name.padEnd(32)} ${c.status.padEnd(22)} ${c.ports.join(", ") || "—"}`
                );
                const header = "NAMES".padEnd(32) + "STATUS".padEnd(22) + "PORTS\n" + "-".repeat(80) + "\n";
                const snapshot = `# Snapshot ${new Date().toISOString().slice(0, 19)}\n${header}${lines.join("\n")}\n\n`;
                setServicesNotes((prev) => snapshot + (prev ? "\n" + prev : ""));
              }}
              disabled={!dockerAvailable || dockerContainers.length === 0}
              className="rounded-lg border border-[var(--border)] px-4 py-2 text-sm hover:bg-[var(--border)]/50 disabled:opacity-50"
            >
              Copy from Docker
            </button>
            {notesLastSaved && (
              <span className="self-center text-xs text-[var(--muted)]">
                Last saved {notesLastSaved}
              </span>
            )}
          </div>
          <textarea
            value={servicesNotes}
            onChange={(e) => setServicesNotes(e.target.value)}
            placeholder="Paste your docker ps output, or add notes like:\n\nnextcloud-nextcloud-1  - port 11000\nimmich_server - port 2283\nadguardhome - DNS 53, UI 3001"
            className="h-[calc(100vh-280px)] min-h-[300px] w-full rounded-xl border border-[var(--border)] bg-[var(--card)] p-4 font-mono text-sm text-[var(--foreground)] focus:border-[var(--accent)] focus:outline-none"
            spellCheck={false}
          />
        </section>
      )}
        </main>
      </div>
    </div>
  );
}
