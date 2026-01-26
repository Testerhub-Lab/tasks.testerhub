import React from "react";

interface SectionTitleProps {
  children: React.ReactNode;
  className?: string;
}

const SectionTitle: React.FC<SectionTitleProps> = ({ children, className = "" }) => {
  return (
    <h2 className={`text-2xl font-bold text-[var(--color-text)] ${className}`}>
      {children}
    </h2>
  );
};

export default SectionTitle;