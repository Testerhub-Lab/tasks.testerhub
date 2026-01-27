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
  value?: string;
  onChange: (value?: string) => void;
  groupId: string;
}

const SegmentedChips: React.FC<SegmentedChipsProps> = ({
  options,
  value,
  onChange,
  groupId,
}) => {
  const layoutId = `chip-indicator-${groupId}`;

  return (
    <LayoutGroup id={groupId}>
      <div className="relative inline-flex flex-nowrap items-center gap-1 rounded-full border border-white/10 p-1 overflow-hidden">
        {options.map((option) => {
          const selected = option.value === value;
  
          return (
            <FilterChip
              key={option.value}
              selected={selected}
              className="relative z-10"
              onClick={() => onChange(selected ? "__all__" : option.value)}
            >
              {selected ? (
                <motion.div
                  layoutId={layoutId}
                  className="absolute -inset-px rounded-full border border-cyan-400/60 bg-white/5 shadow-[0_0_12px_rgba(34,211,238,0.35)] backdrop-blur-md pointer-events-none"
                  transition={{ type: "spring", stiffness: 500, damping: 35 }}
                />
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
