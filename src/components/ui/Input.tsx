"use client";

import React from "react";

type InputProps = React.InputHTMLAttributes<HTMLInputElement>;

const Input = React.forwardRef<HTMLInputElement, InputProps>(
  ({ className = "", type = "text", ...props }, ref) => {
    return (
      <input
        ref={ref}
        {...props}
        type={type}
        className={`input ${className}`}
      />
    );
  }
);

Input.displayName = "Input";

export default Input;
