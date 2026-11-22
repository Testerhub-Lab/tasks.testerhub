"use client";

import { Popover, PopoverButton, PopoverPanel } from "@headlessui/react";
import { useState, type KeyboardEvent } from "react";
import { formatReleaseDate } from "@/shared/releases";

const monthLabel = new Intl.DateTimeFormat("ru-RU", { month: "long", year: "numeric", timeZone: "UTC" });
const dayLabels = ["Пн", "Вт", "Ср", "Чт", "Пт", "Сб", "Вс"];
const toDate = (value: string) => new Date(`${value}T00:00:00Z`);
const dateString = (date: Date) => date.toISOString().slice(0, 10);
const monthStart = (date: Date) => {
  const month = new Date(date);
  month.setUTCDate(1);
  return month;
};

export default function DatePicker({ value, onChange }: {
  value: string | null;
  onChange: (value: string | null) => void;
}) {
  const now = new Date();
  const today = dateString(new Date(now.getTime() - now.getTimezoneOffset() * 60_000));
  const [month, setMonth] = useState(() => monthStart(toDate(value ?? today)));
  const [focusDate, setFocusDate] = useState(value ?? today);
  const start = new Date(month);
  start.setUTCDate(1 - (month.getUTCDay() + 6) % 7);
  const nextMonth = (offset: number) => {
    const next = new Date(month);
    next.setUTCMonth(next.getUTCMonth() + offset);
    if (next.getUTCFullYear() < 1 || next.getUTCFullYear() > 9999) return;
    setMonth(next);
    setFocusDate(dateString(next));
  };

  function moveFocus(event: KeyboardEvent<HTMLElement>) {
    const offsets = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -7, ArrowDown: 7 } as const;
    const offset = offsets[event.key as keyof typeof offsets];
    if (!offset) return;
    event.preventDefault();
    const next = toDate(focusDate);
    next.setUTCDate(next.getUTCDate() + offset);
    if (next.getUTCFullYear() < 1 || next.getUTCFullYear() > 9999) return;
    const day = dateString(next);
    const grid = event.currentTarget;
    setMonth(monthStart(next));
    setFocusDate(day);
    requestAnimationFrame(() => grid.querySelector<HTMLButtonElement>(`[data-day="${day}"]`)?.focus());
  }

  return (
    <Popover>
      <PopoverButton className="button flex min-w-44 items-center justify-between gap-3 text-sm" aria-label="Плановая дата">
        {value ? formatReleaseDate(value) : "Выбрать дату"}
        <svg aria-hidden="true" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
          <rect x="4" y="6" width="16" height="14" rx="2" /><path d="M8 4v4m8-4v4M4 10h16" />
        </svg>
      </PopoverButton>
      <PopoverPanel anchor="bottom start" portal className="z-[120] mt-1 w-64 max-w-[calc(100vw-16px)] rounded-lg border border-[var(--sep)] bg-[var(--surface-popover)] p-2 shadow-xl">
        {({ close }) => (
          <>
            <div className="flex items-center justify-between gap-1 px-1 pb-2 text-sm">
              <button type="button" aria-label="Предыдущий месяц" className="button button--ghost" onClick={() => nextMonth(-1)}>‹</button>
              <span aria-live="polite" className="capitalize">{monthLabel.format(month)}</span>
              <button type="button" aria-label="Следующий месяц" className="button button--ghost" onClick={() => nextMonth(1)}>›</button>
            </div>
            <div className="grid grid-cols-7 text-center text-xs text-[var(--muted)]" aria-hidden="true">
              {dayLabels.map((day) => <span key={day}>{day}</span>)}
            </div>
            <div className="grid grid-cols-7" onKeyDown={moveFocus}>
              {Array.from({ length: 42 }, (_, index) => {
                const date = new Date(start);
                date.setUTCDate(start.getUTCDate() + index);
                const iso = dateString(date);
                const selected = value === iso;
                const valid = date.getUTCFullYear() >= 1 && date.getUTCFullYear() <= 9999;
                return (
                  <button key={date.toISOString()} type="button" data-day={iso} tabIndex={valid && iso === focusDate ? 0 : -1}
                    disabled={!valid}
                    aria-label={valid ? formatReleaseDate(iso) : undefined} aria-pressed={selected} aria-current={iso === today ? "date" : undefined}
                    onClick={() => { setFocusDate(iso); onChange(iso); close(); }}
                    className={`h-8 rounded-md text-xs hover:bg-white/10 focus-visible:outline-2 focus-visible:outline-cyan-400/60 ${selected ? "bg-cyan-400/20 text-cyan-300" : date.getUTCMonth() === month.getUTCMonth() ? "text-[var(--text)]" : "text-[var(--muted)]"}`}>
                    {date.getUTCDate()}
                  </button>
                );
              })}
            </div>
            <div className="mt-2 flex justify-between border-t border-[var(--sep)] pt-1">
              <button type="button" className="button button--ghost" onClick={() => { onChange(null); close(); }}>Очистить</button>
              <button type="button" className="button button--ghost" onClick={() => { setMonth(monthStart(toDate(today))); setFocusDate(today); onChange(today); close(); }}>Сегодня</button>
            </div>
          </>
        )}
      </PopoverPanel>
    </Popover>
  );
}
