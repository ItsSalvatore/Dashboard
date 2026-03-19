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
  os: { hostname: string; uptime: number; platform: string };
} | null;

type Process = {
  pid: number;
  name: string;
  cpu: number;
  mem: number;
  state: string;
  user: string;
};

type PortInfo = {
  port: number;
  connections: { protocol: string; address: string; pid: number | null; process: string | null }[];
};

type AppInfo = {
  name: string;
  port: number;
  url: string;
  status: string;
  process: string | null;
  pid: number | null;
};

const POLL_INTERVAL = 2000;

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
  const [cpuHistory, setCpuHistory] = useState<{ time: string; cpu: number }[]>([]);
  const [memHistory, setMemHistory] = useState<{ time: string; mem: number }[]>([]);
  const [sortBy, setSortBy] = useState<"cpu" | "mem" | "name">("cpu");
  const [baseUrl, setBaseUrl] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<"overview" | "apps">("overview");

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
      const url = baseUrl || (typeof window !== "undefined" ? `${window.location.protocol}//${window.location.hostname}` : "http://localhost");
      const res = await fetch(`/api/websites?baseUrl=${encodeURIComponent(url)}`);
      if (!res.ok) throw new Error("Apps fetch failed");
      const data = await res.json();
      setApps(data.all);
    } catch {
      setError("Failed to load hosted apps");
    }
  }, [baseUrl]);

  useEffect(() => {
    if (typeof window !== "undefined" && !baseUrl) {
      setBaseUrl(`${window.location.protocol}//${window.location.hostname}`);
    }
  }, []);

  useEffect(() => {
    fetchSystem();
    fetchProcesses();
    fetchPorts();
    fetchApps();
    const t = setInterval(() => {
      fetchSystem();
      fetchProcesses();
      fetchPorts();
      fetchApps();
    }, POLL_INTERVAL);
    return () => clearInterval(t);
  }, [fetchSystem, fetchProcesses, fetchPorts, fetchApps]);

  return (
    <div className="min-h-screen p-4 md:p-6 lg:p-8">
      <header className="mb-6 flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-[var(--foreground)]">
            Home Server Dashboard
          </h1>
          <p className="mt-1 text-sm text-[var(--muted)]">
            {system?.os?.hostname ?? "—"} · {system?.os?.platform ?? "—"} · Uptime{" "}
            {system?.os?.uptime != null ? formatUptime(system.os.uptime) : "—"}
          </p>
        </div>
        <nav className="flex items-center gap-2">
          <button
            onClick={() => setActiveTab("overview")}
            className={`rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
              activeTab === "overview"
                ? "bg-[var(--accent)]/20 text-[var(--accent)]"
                : "text-[var(--muted)] hover:bg-[var(--border)] hover:text-[var(--foreground)]"
            }`}
          >
            Overview
          </button>
          <button
            onClick={() => setActiveTab("apps")}
            className={`rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
              activeTab === "apps"
                ? "bg-[var(--accent)]/20 text-[var(--accent)]"
                : "text-[var(--muted)] hover:bg-[var(--border)] hover:text-[var(--foreground)]"
            }`}
          >
            Hosted Apps ({apps.length})
          </button>
        </nav>
        <div className="flex items-center gap-2">
          <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-500/15 px-2.5 py-1 text-xs font-medium text-emerald-400">
            <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse" />
            Live
          </span>
          <span className="text-xs text-[var(--muted)]">
            Refresh every {POLL_INTERVAL / 1000}s
          </span>
        </div>
      </header>

      {error && (
        <div className="mb-4 rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-400">
          {error}
        </div>
      )}

      {activeTab === "apps" ? (
        <section className="mb-6">
          <h2 className="mb-4 text-lg font-semibold text-[var(--foreground)]">
            All hosted sites & apps
          </h2>
          {apps.length === 0 ? (
            <p className="rounded-xl border border-[var(--border)] bg-[var(--card)] px-6 py-12 text-center text-[var(--muted)]">
              No detected apps. Add common services (nginx, Node, Plex, etc.) to see them here.
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
      ) : (
        <>
      {/* System stats + charts */}
      <section className="mb-6 grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <div className="rounded-xl border border-[var(--border)] bg-[var(--card)] p-4">
          <p className="text-xs font-medium uppercase tracking-wider text-[var(--muted)]">
            CPU
          </p>
          <p className="mt-1 font-mono text-2xl font-bold text-[var(--accent)]">
            {system?.cpu?.current ?? "—"}%
          </p>
          <p className="mt-0.5 text-xs text-[var(--muted)]">
            {system?.cpu?.cores ?? "—"} cores
          </p>
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
          <p className="text-xs font-medium uppercase tracking-wider text-[var(--muted)]">
            Disk
          </p>
          <p className="mt-1 font-mono text-2xl font-bold text-violet-400">
            {system?.disk?.usedPercent ?? "—"}%
          </p>
          <p className="mt-0.5 text-xs text-[var(--muted)]">
            {system?.disk
              ? `${formatBytes(system.disk.used)} / ${formatBytes(system.disk.total)}`
              : "—"}
          </p>
        </div>
        <div className="rounded-xl border border-[var(--border)] bg-[var(--card)] p-4 md:col-span-2 lg:col-span-1">
          <p className="text-xs font-medium uppercase tracking-wider text-[var(--muted)]">
            Hosted apps
          </p>
          <p className="mt-1 font-mono text-2xl font-bold text-emerald-400">
            {apps.length}
          </p>
          <p className="mt-0.5 text-xs text-[var(--muted)]">
            {ports.length} listening ports
          </p>
        </div>
      </section>

      {/* CPU & Memory charts */}
      <section className="mb-6 grid gap-4 md:grid-cols-2">
        <div className="rounded-xl border border-[var(--border)] bg-[var(--card)] p-4">
          <h2 className="mb-3 text-sm font-semibold text-[var(--foreground)]">
            CPU usage (last 2 min)
          </h2>
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
          <h2 className="mb-3 text-sm font-semibold text-[var(--foreground)]">
            Memory usage (last 2 min)
          </h2>
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

      {/* Processes */}
      <section className="mb-6">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-sm font-semibold text-[var(--foreground)]">
            Top processes
          </h2>
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
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </section>

      {/* Ports & Hosted apps - side by side */}
      <section className="grid gap-6 lg:grid-cols-2">
        <div>
          <h2 className="mb-3 text-sm font-semibold text-[var(--foreground)]">
            Listening ports
          </h2>
          <div className="max-h-80 overflow-hidden rounded-xl border border-[var(--border)] bg-[var(--card)]">
            <div className="max-h-80 overflow-y-auto">
              <table className="w-full text-left text-sm">
                <thead className="sticky top-0 z-10 bg-[var(--card)] text-[var(--muted)]">
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
                        <td className="px-4 py-2 font-mono">
                          {c.process || "—"}
                        </td>
                        <td className="px-4 py-2 text-[var(--muted)]">
                          {c.pid ?? "—"}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>

        <div>
          <h2 className="mb-3 text-sm font-semibold text-[var(--foreground)]">
            Hosted websites & apps
          </h2>
          <div className="max-h-80 overflow-hidden rounded-xl border border-[var(--border)] bg-[var(--card)]">
            <div className="max-h-80 overflow-y-auto">
              <div className="divide-y divide-[var(--border)]">
                {apps.length === 0 ? (
                  <p className="px-4 py-6 text-center text-sm text-[var(--muted)]">
                    No detected apps. Add common services (nginx, Node, etc.) to see them here.
                  </p>
                ) : (
                  apps.map((app) => (
                    <a
                      key={`${app.port}-${app.name}`}
                      href={app.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center justify-between gap-4 px-4 py-3 transition-colors hover:bg-[var(--border)]/50"
                    >
                      <div className="min-w-0">
                        <p className="font-medium text-[var(--foreground)] truncate">
                          {app.name}
                        </p>
                        <p className="text-xs text-[var(--muted)] truncate">
                          {app.process ? `Process: ${app.process}` : `Port ${app.port}`}
                        </p>
                      </div>
                      <div className="flex shrink-0 items-center gap-2">
                        <span className="rounded bg-emerald-500/20 px-2 py-0.5 text-xs text-emerald-400">
                          {app.status}
                        </span>
                        <span className="font-mono text-xs text-[var(--muted)]">
                          :{app.port}
                        </span>
                      </div>
                    </a>
                  ))
                )}
              </div>
            </div>
          </div>
        </div>
      </section>
        </>
      )}
    </div>
  );
}
