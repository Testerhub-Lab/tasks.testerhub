"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";

type ProjectOption = { id: string; name: string; key: string };

function cn(...parts: Array<string | false | null | undefined>) {
  return parts.filter(Boolean).join(" ");
}

type Props = {
  projects: ProjectOption[];
  value: string;
  onChange: (nextId: string) => void;
  className?: string;
};

export default function ProjectKeyPicker({ projects, value, onChange, className }: Props) {
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState<number>(-1);
  const rootRef = useRef<HTMLDivElement | null>(null);
  const buttonRef = useRef<HTMLButtonElement | null>(null);

  const selected = useMemo(() => projects.find((p) => p.id === value) ?? null, [projects, value]);

  useEffect(() => {
    if (!open) return;

    const onDocMouseDown = (e: MouseEvent) => {
      const root = rootRef.current;
      if (!root) return;
      if (e.target instanceof Node && root.contains(e.target)) return;
      setOpen(false);
    };

    const onKeyDown = (e: KeyboardEvent) => {
      if (!open) return;

      if (e.key === "Escape") {
        e.preventDefault();
        setOpen(false);
        buttonRef.current?.focus();
        return;
      }

      if (e.key === "ArrowDown") {
        e.preventDefault();
        setActive((prev) => (prev < 0 ? 0 : Math.min(prev + 1, projects.length - 1)));
        return;
      }

      if (e.key === "ArrowUp") {
        e.preventDefault();
        setActive((prev) => (prev < 0 ? projects.length - 1 : Math.max(prev - 1, 0)));
        return;
      }

      if (e.key === "Enter") {
        e.preventDefault();
        if (active >= 0 && active < projects.length) {
          onChange(projects[active]!.id);
          setOpen(false);
          buttonRef.current?.focus();
        }
      }
    };

    document.addEventListener("mousedown", onDocMouseDown);
    window.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("mousedown", onDocMouseDown);
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [open, active, projects, onChange]);

  const chip =
    "inline-flex h-7 items-center gap-2 rounded-md border border-white/10 bg-white/5 px-2.5 text-[12px] text-slate-100 " +
    "hover:bg-white/7 focus:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400/40";

  return (
    <div ref={rootRef} className={cn("relative", className)}>
      <button
        ref={buttonRef}
        type="button"
        className={chip}
        aria-haspopup="listbox"
        aria-expanded={open}
        onClick={() => {
          setOpen((v) => !v);
          setActive((prev) => (prev >= 0 ? prev : projects.findIndex((p) => p.id === value)));
        }}
        title={selected ? `${selected.key} — ${selected.name}` : "Project"}
      >
        <span className="font-medium">{selected?.key ?? "—"}</span>
        <span className="pointer-events-none text-slate-300/80">▾</span>
      </button>

      {open && (
        <div
          role="listbox"
          aria-label="Project"
          className={cn(
            "absolute left-0 top-[calc(100%+8px)] z-50 w-[220px]",
            "overflow-hidden rounded-xl border border-white/10",
            "bg-slate-950/70 backdrop-blur-xl shadow-[0_16px_60px_rgba(0,0,0,0.55)]"
          )}
        >
          <div className="max-h-72 overflow-auto py-1">
            {projects.map((p, idx) => {
              const isSelected = p.id === value;
              const isActive = idx === active;

              return (
                <button
                  key={p.id}
                  type="button"
                  className={cn(
                    "flex w-full items-center justify-between gap-3 px-3 py-2 text-left text-[12px]",
                    isActive ? "bg-white/8" : "bg-transparent",
                    "hover:bg-white/8"
                  )}
                  title={`${p.key} — ${p.name}`}
                  onMouseEnter={() => setActive(idx)}
                  onClick={() => {
                    onChange(p.id);
                    setOpen(false);
                    buttonRef.current?.focus();
                  }}
                >
                  <span className="rounded-md border border-white/10 bg-white/5 px-2 py-0.5 font-medium text-slate-100">
                    {p.key}
                  </span>

                  {isSelected && <span className="text-slate-200/80">✓</span>}
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
