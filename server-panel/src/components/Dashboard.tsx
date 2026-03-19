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
  disk: { usedPercent: number; used: number; total: number } | null;
  gpu: { model: string; vram: number; utilizationGpu: number | null } | null;
  os: { hostname: string; uptime: number; platform: string };
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

type Tab = "overview" | "apps" | "docker" | "websites" | "firewall" | "dns" | "ftp" | "backups" | "minecraft" | "ssl" | "server" | "installs" | "files" | "notes";

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

const POLL_INTERVAL = 3000;

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
    if (activeTab === "files") fetchFileManager(fileManagerPath);
    if (activeTab === "notes") fetchNotes();
    if (activeTab === "websites" && selectedWebsite) fetchWebsiteDetail(selectedWebsite);
  }, [activeTab, fileManagerPath, fetchFileManager, fetchNotes, selectedWebsite, fetchWebsiteDetail]);

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
    }, POLL_INTERVAL);
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
    activeTab,
    fileManagerPath,
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

  const tabs: { id: Tab; label: string }[] = [
    { id: "overview", label: "Overview" },
    { id: "apps", label: `Hosted Apps (${apps.length})` },
    { id: "docker", label: "Docker" },
    { id: "websites", label: "Websites" },
    { id: "firewall", label: "Firewall" },
    { id: "dns", label: "DNS" },
    { id: "ftp", label: "FTP" },
    { id: "backups", label: "Backups" },
    { id: "minecraft", label: "Minecraft" },
    { id: "ssl", label: "SSL" },
    { id: "server", label: "Server" },
    { id: "installs", label: "One-Click Installs" },
    { id: "files", label: "File Manager" },
    { id: "notes", label: "Services Notes" },
  ];

  return (
    <div className="flex h-screen flex-col overflow-hidden">
      <header className="sticky top-0 z-20 shrink-0 border-b border-[var(--border)] bg-[var(--background)]/95 backdrop-blur-sm">
        <div className="flex flex-wrap items-center justify-between gap-3 p-3 md:p-4">
          <h1 className="truncate text-lg font-semibold tracking-tight md:text-xl">
            Server Panel
          </h1>
          <nav className="flex flex-wrap items-center gap-1.5">
          {tabs.map((t) => (
            <button
              key={t.id}
              onClick={() => setActiveTab(t.id)}
              className={`rounded-md px-2.5 py-1.5 text-xs font-medium transition-colors md:text-sm ${
                activeTab === t.id
                  ? "bg-[var(--accent)]/20 text-[var(--accent)]"
                  : "text-[var(--muted)] hover:bg-[var(--border)] hover:text-[var(--foreground)]"
              }`}
            >
              {t.label}
            </button>
          ))}
          <span className="hidden items-center gap-1.5 rounded-full bg-emerald-500/15 px-2 py-0.5 text-xs text-emerald-400 sm:inline-flex">
            <span className="h-1 w-1 rounded-full bg-emerald-400 animate-pulse" />
            Live
          </span>
          <button
            onClick={async () => {
              await fetch("/api/auth/logout", { method: "POST" });
              window.location.reload();
            }}
            className="rounded-md px-2 py-1 text-xs text-[var(--muted)] hover:bg-[var(--border)] hover:text-[var(--foreground)]"
          >
            Logout
          </button>
        </nav>
        </div>
      </header>

      <main className="dashboard-content dashboard-scroll flex-1 p-4 md:p-5">
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
          <section className="mb-6 grid gap-4 md:grid-cols-2 lg:grid-cols-5">
            <div className="rounded-xl border border-[var(--border)] bg-[var(--card)] p-4">
              <p className="text-xs font-medium uppercase tracking-wider text-[var(--muted)]">CPU</p>
              <p className="mt-1 font-mono text-2xl font-bold text-[var(--accent)]">
                {system?.cpu?.current ?? "—"}%
              </p>
              <p className="mt-0.5 text-xs text-[var(--muted)]">{system?.cpu?.cores ?? "—"} cores</p>
            </div>
            <div className="rounded-xl border border-[var(--border)] bg-[var(--card)] p-4">
              <p className="text-xs font-medium uppercase tracking-wider text-[var(--muted)]">
                Memory
              </p>
              <p className="mt-1 font-mono text-2xl font-bold text-amber-400">
                {system?.memory?.usedPercent ?? "—"}%
              </p>
              <p className="mt-0.5 text-xs text-[var(--muted)]">
                {system?.memory
                  ? `${formatBytes(system.memory.used)} / ${formatBytes(system.memory.total)}`
                  : "—"}
              </p>
            </div>
            <div className="rounded-xl border border-[var(--border)] bg-[var(--card)] p-4">
              <p className="text-xs font-medium uppercase tracking-wider text-[var(--muted)]">Disk</p>
              <p className="mt-1 font-mono text-2xl font-bold text-violet-400">
                {system?.disk?.usedPercent ?? "—"}%
              </p>
              <p className="mt-0.5 text-xs text-[var(--muted)]">
                {system?.disk
                  ? `${formatBytes(system.disk.used)} / ${formatBytes(system.disk.total)}`
                  : "—"}
              </p>
            </div>
            {system?.gpu && (
              <div className="rounded-xl border border-[var(--border)] bg-[var(--card)] p-4">
                <p className="text-xs font-medium uppercase tracking-wider text-[var(--muted)]">GPU</p>
                <p className="mt-1 font-mono text-lg font-bold text-emerald-400 truncate" title={system.gpu.model}>
                  {system.gpu.model}
                </p>
                <p className="mt-0.5 text-xs text-[var(--muted)]">
                  {system.gpu.utilizationGpu != null ? `${system.gpu.utilizationGpu}%` : "—"}
                </p>
              </div>
            )}
            <div className="rounded-xl border border-[var(--border)] bg-[var(--card)] p-4">
              <p className="text-xs font-medium uppercase tracking-wider text-[var(--muted)]">Apps</p>
              <p className="mt-1 font-mono text-2xl font-bold text-emerald-400">{apps.length}</p>
              <p className="mt-0.5 text-xs text-[var(--muted)]">{ports.length} ports</p>
            </div>
          </section>

          <section className="mb-6">
            <h2 className="mb-3 text-sm font-semibold">Quick actions</h2>
            <div className="flex flex-wrap gap-2">
              <button onClick={() => setActiveTab("docker")} className="rounded-lg border border-[var(--border)] px-3 py-2 text-sm hover:bg-[var(--border)]/50">
                Docker ({dockerContainers.length})
              </button>
              <button onClick={() => setActiveTab("websites")} className="rounded-lg border border-[var(--border)] px-3 py-2 text-sm hover:bg-[var(--border)]/50">
                Websites ({websites.length})
              </button>
              <button onClick={() => setActiveTab("backups")} className="rounded-lg border border-[var(--border)] px-3 py-2 text-sm hover:bg-[var(--border)]/50">
                Backups
              </button>
              <button onClick={() => setActiveTab("notes")} className="rounded-lg border border-[var(--border)] px-3 py-2 text-sm hover:bg-[var(--border)]/50">
                Services Notes
              </button>
            </div>
          </section>

          <section className="mb-6 grid gap-4 md:grid-cols-2">
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
          </section>

          <section className="mb-6">
            <div className="mb-3 flex items-center justify-between">
              <h2 className="text-sm font-semibold">Processes (kill from here)</h2>
              <div className="flex gap-2">
                {(["cpu", "mem", "name"] as const).map((s) => (
                  <button
                    key={s}
                    onClick={() => setSortBy(s)}
                    className={`rounded-md px-2.5 py-1 text-xs font-medium transition-colors ${
                      sortBy === s
                        ? "bg-[var(--accent)]/20 text-[var(--accent)]"
                        : "text-[var(--muted)] hover:bg-[var(--border)] hover:text-[var(--foreground)]"
                    }`}
                  >
                    Sort by {s}
                  </button>
                ))}
              </div>
            </div>
            <div className="overflow-hidden rounded-xl border border-[var(--border)] bg-[var(--card)]">
              <div className="max-h-64 overflow-y-auto">
                <table className="w-full text-left text-sm">
                  <thead className="sticky top-0 z-10 bg-[var(--card)] text-[var(--muted)]">
                    <tr>
                      <th className="px-4 py-3 font-medium">Process</th>
                      <th className="px-4 py-3 font-medium">PID</th>
                      <th className="px-4 py-3 font-medium">User</th>
                      <th className="px-4 py-3 font-medium text-right">CPU %</th>
                      <th className="px-4 py-3 font-medium text-right">Mem (MB)</th>
                      <th className="px-4 py-3 font-medium w-20"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {processes.map((p) => (
                      <tr
                        key={p.pid}
                        className="border-t border-[var(--border)] hover:bg-[var(--border)]/50"
                      >
                        <td className="px-4 py-2 font-mono">{p.name}</td>
                        <td className="px-4 py-2 text-[var(--muted)]">{p.pid}</td>
                        <td className="px-4 py-2 text-[var(--muted)]">{p.user}</td>
                        <td className="px-4 py-2 text-right font-mono">{p.cpu ?? 0}</td>
                        <td className="px-4 py-2 text-right font-mono">{p.mem ?? 0}</td>
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
          </section>

          <section className="grid gap-6 lg:grid-cols-2">
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
          </section>
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
            <div className="mb-6 rounded-xl border border-[var(--border)] bg-[var(--card)] p-6">
              <h3 className="mb-3 font-medium">Create new site</h3>
              <div className="flex flex-wrap gap-3">
                <input
                  type="text"
                  value={newDomain}
                  onChange={(e) => setNewDomain(e.target.value)}
                  placeholder="example.com"
                  className="rounded-lg border border-[var(--border)] bg-[var(--background)] px-4 py-2 font-mono text-[var(--foreground)] focus:border-[var(--accent)] focus:outline-none"
                />
                <select
                  value={newWebserver}
                  onChange={(e) => setNewWebserver(e.target.value as "nginx" | "ols")}
                  className="rounded-lg border border-[var(--border)] bg-[var(--background)] px-4 py-2 text-[var(--foreground)]"
                >
                  <option value="nginx">nginx</option>
                  <option value="ols">OpenLiteSpeed</option>
                </select>
                <label className="flex items-center gap-2 text-sm">
                  <input type="checkbox" checked={newWordpress} onChange={(e) => setNewWordpress(e.target.checked)} className="rounded" />
                  WordPress (Docker)
                </label>
                <label className="flex items-center gap-2 text-sm">
                  <input type="checkbox" checked={newCreateDnsZone} onChange={(e) => setNewCreateDnsZone(e.target.checked)} className="rounded" />
                  Create DNS zone
                </label>
                <label className="flex items-center gap-2 text-sm">
                  <input type="checkbox" checked={newCreateSsl} onChange={(e) => setNewCreateSsl(e.target.checked)} className="rounded" />
                  Issue SSL
                </label>
                <button
                  onClick={createWebsite}
                  disabled={creatingSite || !newDomain.trim()}
                  className="rounded-lg bg-[var(--accent)]/20 px-4 py-2 font-medium text-[var(--accent)] hover:bg-[var(--accent)]/30 disabled:opacity-50"
                >
                  {creatingSite ? "Creating…" : "Create"}
                </button>
              </div>
              <p className="mt-2 text-xs text-[var(--muted)]">
                Integrated flow: optionally create DNS zone (bind9) and issue Let&apos;s Encrypt SSL. Point domain DNS to server first.
              </p>
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
  );
}
