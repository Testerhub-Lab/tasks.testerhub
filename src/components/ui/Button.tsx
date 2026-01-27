import React from "react";

type ButtonProps = React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "primary" | "secondary" | "ghost";
};

const Button: React.FC<ButtonProps> = ({
  children,
  className = "",
  variant = "primary",
  type = "button",
  ...props
}) => {
  const baseStyles = "button";
  const variantStyles =
    variant === "primary"
      ? "bg-[var(--color-primary)] hover:bg-[#0088a3]"
      : variant === "secondary"
        ? "bg-transparent border border-[var(--color-card-border)] hover:border-[var(--color-primary)]"
        : "bg-transparent text-[var(--color-text-secondary)] hover:text-[var(--color-text)]";

  return (
    <button
      {...props}
      type={type}
      className={`${baseStyles} ${variantStyles} ${className}`}
    >
      {children}
    </button>
  );
};

export default Button;
