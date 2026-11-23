"use client";

import { Listbox, ListboxButton, ListboxOption, ListboxOptions } from "@headlessui/react";
import type { ReactNode } from "react";

export default function MenuSelect<T extends string>({
  value, options, onChange, ariaLabel, leading, disabled, inline, displayValue, showChevron = true,
}: {
  value: T;
  options: readonly { value: T; label: string; icon?: ReactNode }[];
  onChange: (value: T) => void;
  ariaLabel: string;
  leading?: ReactNode;
  disabled?: boolean;
  inline?: boolean;
  displayValue?: ReactNode;
  showChevron?: boolean;
}) {
  const selected = options.find((option) => option.value === value);
  return (
    <Listbox value={value} onChange={onChange} disabled={disabled}>
      <ListboxButton aria-label={ariaLabel} title={typeof displayValue === "string" ? displayValue : selected?.label}
        className={`inline-flex h-7 min-w-0 items-center gap-1.5 rounded-md px-2 text-xs text-[var(--text)] transition hover:bg-white/10 focus-visible:outline-2 focus-visible:outline-cyan-400/60 disabled:opacity-50 ${inline ? "max-w-full" : "border border-[var(--sep)] bg-[var(--control-bg)]"}`}>
        {leading}
        <span className="min-w-0 truncate">{displayValue ?? selected?.label ?? value}</span>
        {showChevron ? <span aria-hidden="true" className="shrink-0 text-[var(--muted)]">▾</span> : null}
      </ListboxButton>
      <ListboxOptions anchor="bottom start" portal modal={false}
        className="z-[120] mt-1 max-h-64 min-w-44 max-w-[calc(100vw-16px)] overflow-auto rounded-lg border border-[var(--sep)] bg-[var(--surface-popover)] p-1 text-xs text-[var(--text)] shadow-xl outline-none">
        {options.map((option) => (
          <ListboxOption key={option.value} value={option.value}
            className="flex min-h-8 cursor-default items-center gap-2 rounded-md px-2.5 py-1.5 outline-none data-focus:bg-white/10">
            {option.icon ? <span aria-hidden="true">{option.icon}</span> : null}
            <span className="min-w-0 flex-1 break-words">{option.label}</span>
            <span aria-hidden="true" className="w-3 text-cyan-400">{option.value === value ? "✓" : ""}</span>
          </ListboxOption>
        ))}
      </ListboxOptions>
    </Listbox>
  );
}
