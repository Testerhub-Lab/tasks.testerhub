import * as React from "react";

type CardProps = React.HTMLAttributes<HTMLDivElement> & {
  variant?: "glass" | "surface";
};

const Card = React.forwardRef<HTMLDivElement, CardProps>(
  ({ className = "", variant = "surface", ...props }, ref) => {
    const base = variant === "glass" ? "glass" : "surface";
    return (
      <div
        ref={ref}
        className={`${base} ${className}`.trim()}
        {...props}
      />
    );
  }
);

Card.displayName = "Card";

export default Card;
