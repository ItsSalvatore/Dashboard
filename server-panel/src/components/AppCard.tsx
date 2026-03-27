"use client";

import { useEffect, useMemo, useState } from "react";

type AppCardProps = {
  name: string;
  port: number;
  url: string;
  process: string | null;
};

function getFaviconUrl(url: string): string {
  try {
    const u = new URL(url);
    return `https://www.google.com/s2/favicons?domain=${u.hostname}&sz=64`;
  } catch {
    return "";
  }
}

function getHostLabel(url: string): string {
  try {
    return new URL(url).host;
  } catch {
    return url;
  }
}

export default function AppCard({ name, port, url, process }: AppCardProps) {
  const [reachable, setReachable] = useState<boolean | null>(null);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [previewLoaded, setPreviewLoaded] = useState(false);
  const faviconUrl = useMemo(() => getFaviconUrl(url), [url]);
  const hostLabel = useMemo(() => getHostLabel(url), [url]);

  useEffect(() => {
    fetch(`/api/health?url=${encodeURIComponent(url)}`)
      .then((r) => r.json())
      .then((d) => setReachable(d.ok))
      .catch(() => setReachable(false));
  }, [url]);

  return (
    <div className="group flex flex-col overflow-hidden rounded-2xl border border-[var(--border)] bg-[var(--card)] transition hover:border-[var(--accent)]/30 hover:shadow-lg hover:shadow-black/20">
      <div className="relative aspect-video w-full border-b border-[var(--border)] bg-[linear-gradient(135deg,rgba(34,211,238,0.12),rgba(12,12,15,0.96)_68%)]">
        {previewOpen ? (
          <>
            <iframe
              src={url}
              title={`Preview: ${name}`}
              className="h-full w-full border-0"
              sandbox="allow-scripts allow-same-origin"
              onLoad={() => setPreviewLoaded(true)}
            />
            {!previewLoaded && (
              <div className="absolute inset-0 flex items-center justify-center bg-[var(--card)]/95">
                <div className="flex flex-col items-center gap-2 text-[var(--muted)]">
                  <div className="h-8 w-8 animate-spin rounded-full border-2 border-[var(--border)] border-t-[var(--accent)]" />
                  <span className="text-xs">Loading preview...</span>
                </div>
              </div>
            )}
          </>
        ) : (
          <div className="flex h-full flex-col justify-between p-4">
            <div className="flex items-start justify-between gap-3">
              <span className="rounded-full border border-[var(--border)] bg-black/20 px-2.5 py-1 text-[11px] uppercase tracking-[0.18em] text-[var(--accent)]">
                App Preview
              </span>
              <span
                className={`rounded-full px-2.5 py-1 text-xs font-medium ${
                  reachable === true
                    ? "bg-emerald-500/20 text-emerald-300"
                    : reachable === false
                      ? "bg-red-500/20 text-red-300"
                      : "bg-[var(--border)] text-[var(--muted)]"
                }`}
              >
                {reachable === true ? "Online" : reachable === false ? "Offline" : "Checking"}
              </span>
            </div>
            <div>
              <p className="text-lg font-semibold text-[var(--foreground)]">{name}</p>
              <p className="mt-1 truncate text-sm text-[var(--muted)]">{hostLabel}</p>
              <p className="mt-3 text-xs text-[var(--muted)]">
                Preview loads only when requested to keep the dashboard light.
              </p>
            </div>
          </div>
        )}
      </div>
      <div className="flex items-start gap-3 p-4">
        <img
          src={faviconUrl}
          alt=""
          className="h-10 w-10 shrink-0 rounded-xl border border-[var(--border)] bg-black/20 object-contain p-1"
          onError={(e) => {
            (e.target as HTMLImageElement).style.display = "none";
          }}
        />
        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="truncate font-medium text-[var(--foreground)]">{name}</p>
              <p className="truncate text-xs text-[var(--muted)]">
                {process ? process : `Port ${port}`}
              </p>
            </div>
            <span className="font-mono text-xs text-[var(--muted)]">:{port}</span>
          </div>
          <div className="mt-4 flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => {
                if (previewOpen) {
                  setPreviewLoaded(false);
                }
                setPreviewOpen(!previewOpen);
              }}
              className="rounded-lg border border-[var(--border)] px-3 py-1.5 text-xs text-[var(--foreground)] transition hover:bg-[var(--border)]/60"
            >
              {previewOpen ? "Hide preview" : "Load preview"}
            </button>
            <a
              href={url}
              target="_blank"
              rel="noopener noreferrer"
              className="rounded-lg bg-[var(--accent)] px-3 py-1.5 text-xs font-medium text-slate-950 transition hover:bg-cyan-300"
            >
              Open app
            </a>
          </div>
        </div>
      </div>
    </div>
  );
}
