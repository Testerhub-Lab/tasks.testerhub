"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";

function cn(...parts: Array<string | false | null | undefined>) {
  return parts.filter(Boolean).join(" ");
}

function normalizeTag(t: string) {
  return t.trim().replace(/\s+/g, " ");
}

function mergeUniqueCaseInsensitive(a: string[], b: string[]): string[] {
  const map = new Map<string, string>();
  for (const t of a) map.set(t.toLowerCase(), t);
  for (const t of b) map.set(t.toLowerCase(), t);
  return Array.from(map.values()).sort((x, y) => x.localeCompare(y));
}

type Props = {
  value: string[]; // selected tags
  onChange: (next: string[]) => void;
  className?: string;
};

export default function TagsPicker({ value, onChange, className }: Props) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");

  // Храним только "известные" теги (то, что пользователь добавлял)
  const [knownTags, setKnownTags] = useState<string[]>(() => value);

  const rootRef = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);

  const selected = value;

  // Меню всегда показывает known + selected (вычисляем, без setState в effect)
  const library = useMemo(() => mergeUniqueCaseInsensitive(knownTags, selected), [knownTags, selected]);

  useEffect(() => {
    if (!open) return;

    const onDocMouseDown = (e: MouseEvent) => {
      const root = rootRef.current;
      if (!root) return;
      if (e.target instanceof Node && root.contains(e.target)) return;
      setOpen(false);
      setQuery("");
    };

    const onKeyDown = (e: KeyboardEvent) => {
      if (!open) return;
      if (e.key === "Escape") {
        e.preventDefault();
        setOpen(false);
        setQuery("");
      }
    };

    document.addEventListener("mousedown", onDocMouseDown);
    window.addEventListener("keydown", onKeyDown);

    requestAnimationFrame(() => inputRef.current?.focus());

    return () => {
      document.removeEventListener("mousedown", onDocMouseDown);
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  const chip =
    "inline-flex h-7 items-center gap-2 rounded-md border border-white/10 bg-white/5 px-2.5 text-[12px] text-slate-100 " +
    "hover:bg-white/7 focus:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400/40";

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return library;
    return library.filter((t) => t.toLowerCase().includes(q));
  }, [library, query]);

  const ensureKnown = (tag: string) => {
    const norm = normalizeTag(tag);
    if (!norm) return;
    setKnownTags((prev) => {
      const key = norm.toLowerCase();
      if (prev.some((t) => t.toLowerCase() === key)) return prev;
      return [...prev, norm].sort((a, b) => a.localeCompare(b));
    });
  };

  const toggleTag = (tag: string) => {
    const norm = normalizeTag(tag);
    if (!norm) return;

    const exists = selected.some((t) => t.toLowerCase() === norm.toLowerCase());
    const next = exists
      ? selected.filter((t) => t.toLowerCase() !== norm.toLowerCase())
      : [...selected, norm];

    onChange(next);
    ensureKnown(norm);
  };

  const addFromQuery = () => {
    const norm = normalizeTag(query);
    if (!norm) return;
    toggleTag(norm);
    setQuery("");
    requestAnimationFrame(() => inputRef.current?.focus());
  };

  const summary = useMemo(() => {
    if (selected.length === 0) return "Labels";
    if (selected.length === 1) return selected[0]!;
    return `${selected[0]} +${selected.length - 1}`;
  }, [selected]);

  return (
    <div ref={rootRef} className={cn("relative", className)}>
      <button
        type="button"
        className={chip}
        aria-haspopup="dialog"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        title={selected.length ? selected.join(", ") : "Labels"}
      >
        <span className="font-medium">{summary}</span>
        <span className="pointer-events-none text-slate-300/80">▾</span>
      </button>

      {open && (
        <div
          className={cn(
            "absolute left-0 top-[calc(100%+8px)] z-50 w-[320px]",
            "overflow-hidden rounded-xl border border-white/10",
            "bg-slate-950/70 backdrop-blur-xl shadow-[0_16px_60px_rgba(0,0,0,0.55)]"
          )}
        >
          <div className="p-2">
            <input
              ref={inputRef}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  addFromQuery();
                }
              }}
              placeholder="Search or add tag…"
              autoComplete="off"
              autoCorrect="off"
              autoCapitalize="off"
              spellCheck={false}
              className={cn(
                "w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2",
                "text-[12px] text-slate-100 placeholder:text-slate-500/70",
                "focus:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400/40"
              )}
            />

            <div className="mt-2 max-h-64 overflow-auto rounded-lg border border-white/10">
              {filtered.length === 0 ? (
                <div className="px-3 py-2 text-[12px] text-slate-400/80">
                  No tags. Press Enter to add “{normalizeTag(query)}”.
                </div>
              ) : (
                filtered.map((t) => {
                  const checked = selected.some((x) => x.toLowerCase() === t.toLowerCase());
                  return (
                    <button
                      key={t.toLowerCase()}
                      type="button"
                      className={cn(
                        "flex w-full items-center justify-between gap-3 px-3 py-2 text-left text-[12px]",
                        "hover:bg-white/8"
                      )}
                      onClick={() => toggleTag(t)}
                    >
                      <span className="min-w-0 truncate text-slate-200/90">{t}</span>
                      {checked && <span className="text-slate-200/80">✓</span>}
                    </button>
                  );
                })
              )}
            </div>

            <div className="mt-2 text-[11px] text-slate-400/70">Enter — add · Esc — close</div>
          </div>
        </div>
      )}
    </div>
  );
}
