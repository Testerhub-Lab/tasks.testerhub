import * as React from "react";

type CardProps = React.HTMLAttributes<HTMLDivElement> & {
  variant?: "glass" | "surface" | "plain" | "section";
  padding?: "none" | "sm" | "md" | "lg";
};

const Card = React.forwardRef<HTMLDivElement, CardProps>(
  (
    { className = "", variant = "section", padding = "lg", ...props },
    ref
  ) => {
    const base =
      variant === "glass"
        ? "glass"
        : variant === "plain"
          ? "plain"
          : "surface";

    const pad =
      padding === "none"
        ? ""
        : padding === "sm"
          ? "p-3"
          : padding === "md"
            ? "p-4"
            : "p-5";

    // "section" = нормальная карточка для контента (то, что тебе нужно в деталке)
    const section =
      variant === "section"
        ? `surface ${pad} rounded-[var(--radius-lg)] overflow-hidden`
        : `${base} ${pad} rounded-[var(--radius-lg)] overflow-hidden`;

    return (
      <div
        ref={ref}
        className={`${section} ${className}`.trim()}
        {...props}
      />
    );
  }
);

Card.displayName = "Card";

export default Card;
