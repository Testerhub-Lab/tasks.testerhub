"use client";

import React from "react";
import { LayoutGroup, motion } from "framer-motion";
import FilterChip from "./FilterChip";

interface SegmentedOption {
  label: string;
  value: string;
}

interface SegmentedChipsProps {
  options: SegmentedOption[];
  groupId: string;

  /** single (default) or multi toggle */
  multiple?: boolean;

  /** single: string, multi: string[] */
  value?: string | string[];

  /** single: string | undefined, multi: string[] */
  onChange: (value?: string | string[]) => void;
}

const SegmentedChips: React.FC<SegmentedChipsProps> = ({
  options,
  value,
  onChange,
  groupId,
  multiple = false,
}) => {
  const layoutId = `chip-indicator-${groupId}`;

  const selectedSet = React.useMemo(() => {
    if (Array.isArray(value)) return new Set(value);
    if (typeof value === "string" && value !== "__all__") return new Set([value]);
    return new Set<string>();
  }, [value]);

  const isSelected = (v: string) => {
    if (multiple) {
      if (v === "__all__") return selectedSet.size === 0;
      return selectedSet.has(v);
    }
    return v === (value ?? "__all__");
  };

  const handleClick = (v: string) => {
    if (!multiple) {
      const selected = v === (value ?? "__all__");
      onChange(selected ? "__all__" : v);
      return;
    }

    // multiple
    if (v === "__all__") {
      onChange([]); // All = empty selection
      return;
    }

    const next = new Set(selectedSet);
    if (next.has(v)) next.delete(v);
    else next.add(v);

    onChange(Array.from(next));
  };

  return (
    <LayoutGroup id={groupId}>
      <div className="relative inline-flex flex-nowrap items-center gap-1 rounded-full border border-white/10 p-1 overflow-hidden">
        {options.map((option) => {
          const selected = isSelected(option.value);

          return (
            <FilterChip
              key={option.value}
              selected={selected}
              className="relative z-10"
              onClick={() => handleClick(option.value)}
            >
              {/* Single mode: one moving indicator (как было) */}
              {!multiple && selected ? (
                <motion.div
                  layoutId={layoutId}
                  className="absolute -inset-px rounded-full border border-cyan-400/60 bg-white/5 shadow-[0_0_12px_rgba(34,211,238,0.35)] backdrop-blur-md pointer-events-none"
                  transition={{ type: "spring", stiffness: 500, damping: 35 }}
                />
              ) : null}

              {/* Multi mode: статический highlight на каждый выбранный */}
              {multiple && selected ? (
                <span className="absolute -inset-px rounded-full border border-cyan-400/50 bg-white/5 shadow-[0_0_12px_rgba(34,211,238,0.20)] pointer-events-none" />
              ) : null}

              <span className="relative z-10">{option.label}</span>
            </FilterChip>
          );
        })}
      </div>
    </LayoutGroup>
  );
};

export default SegmentedChips;
