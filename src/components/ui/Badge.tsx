import React from "react";

interface BadgeProps {
  children: React.ReactNode;
  className?: string;
}

const Badge: React.FC<BadgeProps> = ({ children, className = "" }) => {
  return (
    <span
      className={`px-2 py-1 text-sm font-medium rounded-full bg-[var(--color-card-bg)] border border-[var(--color-card-border)] ${className}`}
    >
      {children}
    </span>
  );
};

export default Badge;