"use client";

import { useEffect, useState } from "react";

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

export default function AppCard({ name, port, url, process }: AppCardProps) {
  const [reachable, setReachable] = useState<boolean | null>(null);
  const [previewLoaded, setPreviewLoaded] = useState(false);

  useEffect(() => {
    fetch(`/api/health?url=${encodeURIComponent(url)}`)
      .then((r) => r.json())
      .then((d) => setReachable(d.ok))
      .catch(() => setReachable(false));
  }, [url]);

  return (
    <div className="group flex flex-col overflow-hidden rounded-xl border border-[var(--border)] bg-[var(--card)] transition-shadow hover:shadow-lg hover:shadow-black/20">
      {/* Live preview iframe */}
      <div className="relative aspect-video w-full bg-[var(--background)]">
        <iframe
          src={url}
          title={`Preview: ${name}`}
          className="h-full w-full border-0"
          sandbox="allow-scripts allow-same-origin"
          onLoad={() => setPreviewLoaded(true)}
        />
        {!previewLoaded && (
          <div className="absolute inset-0 flex items-center justify-center bg-[var(--card)]">
            <div className="flex flex-col items-center gap-2 text-[var(--muted)]">
              <div className="h-8 w-8 animate-spin rounded-full border-2 border-[var(--border)] border-t-[var(--accent)]" />
              <span className="text-xs">Loading preview…</span>
            </div>
          </div>
        )}
        <a
          href={url}
          target="_blank"
          rel="noopener noreferrer"
          className="absolute inset-0 z-10"
          aria-label={`Open ${name}`}
        />
      </div>

      {/* Card footer */}
      <div className="flex items-center gap-3 border-t border-[var(--border)] p-3">
        <img
          src={getFaviconUrl(url)}
          alt=""
          className="h-8 w-8 shrink-0 rounded object-contain"
          onError={(e) => {
            (e.target as HTMLImageElement).style.display = "none";
          }}
        />
        <div className="min-w-0 flex-1">
          <p className="truncate font-medium text-[var(--foreground)]">{name}</p>
          <p className="truncate text-xs text-[var(--muted)]">
            {process ? process : `Port ${port}`}
          </p>
        </div>
        <div className="flex shrink-0 flex-col items-end gap-0.5">
          <span
            className={`rounded px-2 py-0.5 text-xs font-medium ${
              reachable === true
                ? "bg-emerald-500/20 text-emerald-400"
                : reachable === false
                  ? "bg-red-500/20 text-red-400"
                  : "bg-[var(--border)] text-[var(--muted)]"
            }`}
          >
            {reachable === true ? "Up" : reachable === false ? "Down" : "…"}
          </span>
          <span className="font-mono text-xs text-[var(--muted)]">:{port}</span>
        </div>
      </div>
    </div>
  );
}
