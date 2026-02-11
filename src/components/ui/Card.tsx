import * as React from "react";

type CardProps = React.HTMLAttributes<HTMLDivElement> & {
  variant?: "glass" | "surface" | "plain" | "section";
  padding?: "none" | "sm" | "md" | "lg";
  /** Use only when you really need clipping (rare). Keeps Linear feel by default. */
  clip?: boolean;
};

const Card = React.forwardRef<HTMLDivElement, CardProps>(
  (
    { className = "", variant = "section", padding = "lg", clip = false, ...props },
    ref
  ) => {
    const base =
      variant === "glass" ? "glass" : variant === "plain" ? "plain" : "surface";

    const pad =
      padding === "none"
        ? ""
        : padding === "sm"
          ? "p-3"
          : padding === "md"
            ? "p-4"
            : "p-5";

    // Less round, flatter by default. Clipping only when requested.
    const radius = "rounded-[var(--radius-md)]";
    const overflow = clip ? "overflow-hidden" : "";

    const section =
      variant === "section"
        ? `surface ${pad} ${radius} ${overflow}`
        : `${base} ${pad} ${radius} ${overflow}`;

    return <div ref={ref} className={`${section} ${className}`.trim()} {...props} />;
  }
);

Card.displayName = "Card";

export default Card;
