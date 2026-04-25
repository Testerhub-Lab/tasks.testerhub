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
  const base = "button";
  const variantClass =
    variant === "primary"
      ? "button--primary"
      : variant === "ghost"
        ? "button--ghost"
        : "";

  return (
    <button
      {...props}
      type={type}
      className={[base, variantClass, className].filter(Boolean).join(" ")}
    >
      {children}
    </button>
  );
};

export default Button;
