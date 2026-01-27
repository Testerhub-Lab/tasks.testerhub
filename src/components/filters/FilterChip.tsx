"use client";

import React from "react";

interface FilterChipProps {
  selected?: boolean;
  disabled?: boolean;
  onClick?: () => void;
  children: React.ReactNode;
  className?: string;
}

const FilterChip: React.FC<FilterChipProps> = ({
  selected = false,
  disabled = false,
  onClick,
  children,
  className = "",
}) => {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={[
        "relative inline-flex h-8 items-center justify-center rounded-full px-3 text-sm",
        "transition-colors select-none",
        // ВАЖНО: убрали border у каждого чипа, чтобы не было “тройной рамки”
        selected
          ? "text-white"
          : "text-slate-200/90 hover:bg-white/5",
        "focus:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400/40",
        disabled ? "pointer-events-none opacity-50" : "",
        className,
      ].join(" ")}
    >
      {children}
    </button>

  );
};

export default FilterChip;
