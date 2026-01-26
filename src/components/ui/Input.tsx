"use client";

import React from "react";

type InputProps = React.InputHTMLAttributes<HTMLInputElement>;

const Input: React.FC<InputProps> = ({
  className = "",
  type = "text",
  ...props
}) => {
  return (
    <input
      {...props}
      type={type}
      className={`input ${className}`}
    />
  );
};

export default Input;
