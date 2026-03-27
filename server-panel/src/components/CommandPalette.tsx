"use client";

import { useEffect, useMemo, useRef, useState } from "react";

export type CommandPaletteItem = {
  id: string;
  group: string;
  title: string;
  subtitle?: string;
  keywords?: string;
  onSelect: () => void;
};

type CommandPaletteProps = {
  items: CommandPaletteItem[];
  onClose: () => void;
};

function normalize(value: string | undefined): string {
  return (value ?? "").toLowerCase().trim();
}

export default function CommandPalette({ items, onClose }: CommandPaletteProps) {
  const [query, setQuery] = useState("");
  const [selectedIndex, setSelectedIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement | null>(null);

  const filteredItems = useMemo(() => {
    const normalizedQuery = normalize(query);
    if (!normalizedQuery) {
      return items;
    }

    return items.filter((item) =>
      [item.title, item.subtitle, item.keywords]
        .map((value) => normalize(value))
        .some((value) => value.includes(normalizedQuery))
    );
  }, [items, query]);

  const groupedItems = useMemo(() => {
    const groups = new Map<string, CommandPaletteItem[]>();

    for (const item of filteredItems) {
      const existing = groups.get(item.group) ?? [];
      existing.push(item);
      groups.set(item.group, existing);
    }

    return Array.from(groups.entries());
  }, [filteredItems]);

  const activeIndex =
    filteredItems.length === 0 ? 0 : Math.min(selectedIndex, Math.max(filteredItems.length - 1, 0));

  useEffect(() => {
    const timer = window.setTimeout(() => inputRef.current?.focus(), 0);
    return () => window.clearTimeout(timer);
  }, []);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        onClose();
        return;
      }

      if (event.key === "ArrowDown") {
        event.preventDefault();
        setSelectedIndex((prev) => (filteredItems.length === 0 ? 0 : (prev + 1) % filteredItems.length));
        return;
      }

      if (event.key === "ArrowUp") {
        event.preventDefault();
        setSelectedIndex((prev) =>
          filteredItems.length === 0 ? 0 : (prev - 1 + filteredItems.length) % filteredItems.length
        );
        return;
      }

      if (event.key === "Enter") {
        const item = filteredItems[activeIndex];
        if (item) {
          event.preventDefault();
          item.onSelect();
          onClose();
        }
      }
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [activeIndex, filteredItems, onClose]);

  let flatIndex = -1;

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/60 px-4 py-10 backdrop-blur-sm">
      <button
        aria-label="Close command palette"
        className="absolute inset-0"
        onClick={onClose}
      />
      <div className="relative z-10 w-full max-w-3xl overflow-hidden rounded-3xl border border-[var(--border)] bg-[var(--card)] shadow-2xl">
        <div className="border-b border-[var(--border)] p-4">
          <input
            ref={inputRef}
            value={query}
            onChange={(event) => {
              setQuery(event.target.value);
              setSelectedIndex(0);
            }}
            placeholder="Search tabs, apps, containers, integrations, or safe actions"
            className="w-full rounded-2xl border border-[var(--border)] bg-[var(--background)] px-4 py-3 text-sm text-[var(--foreground)] outline-none focus:border-[var(--accent)]"
          />
          <p className="mt-2 text-xs text-[var(--muted)]">
            Use arrow keys to move, Enter to open, and Esc to close.
          </p>
        </div>
        <div className="max-h-[70vh] overflow-y-auto p-3">
          {groupedItems.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-[var(--border)] px-4 py-12 text-center">
              <p className="text-sm font-medium text-[var(--foreground)]">Nothing matches that search.</p>
              <p className="mt-2 text-sm text-[var(--muted)]">
                Try another keyword for a tab, resource, or action.
              </p>
            </div>
          ) : (
            <div className="space-y-4">
              {groupedItems.map(([group, groupItems]) => (
                <div key={group}>
                  <p className="px-3 text-[11px] uppercase tracking-[0.2em] text-[var(--muted)]">
                    {group}
                  </p>
                  <div className="mt-2 space-y-1">
                    {groupItems.map((item) => {
                      flatIndex += 1;
                      const isSelected = flatIndex === activeIndex;

                      return (
                        <button
                          key={item.id}
                          onMouseEnter={() => setSelectedIndex(flatIndex)}
                          onClick={() => {
                            item.onSelect();
                            onClose();
                          }}
                          className={`w-full rounded-2xl border px-4 py-3 text-left transition ${
                            isSelected
                              ? "border-[var(--accent)]/40 bg-[var(--accent)]/12"
                              : "border-transparent hover:border-[var(--border)] hover:bg-black/20"
                          }`}
                        >
                          <div className="flex items-center justify-between gap-3">
                            <p className="font-medium text-[var(--foreground)]">{item.title}</p>
                            <span className="text-[11px] uppercase tracking-[0.18em] text-[var(--muted)]">
                              Open
                            </span>
                          </div>
                          {item.subtitle && (
                            <p className="mt-1 text-sm text-[var(--muted)]">{item.subtitle}</p>
                          )}
                        </button>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
