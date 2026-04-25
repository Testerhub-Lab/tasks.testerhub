import React from "react";

interface BadgeProps {
  children: React.ReactNode;
  className?: string;
}

const Badge: React.FC<BadgeProps> = ({ children, className = "" }) => {
  return (
    <span
    className={`inline-flex items-center rounded-md border px-2 py-0.5 text-xs font-medium 
      bg-[rgba(255,255,255,0.04)] text-white/80 border-[rgba(255,255,255,0.12)] 
      ${className}`}    
    >
      {children}
    </span>
  );
};

export default Badge;
