"use client";

import React from "react";
import { useRouter } from "next/navigation";
import Button from "../ui/Button";

const BackButton: React.FC = () => {
  const router = useRouter();

  return (
    <Button
      type="button"
      variant="ghost"
      className="h-7 px-2 text-xs text-white/70 hover:text-white"
      onClick={() => {
        if (window.history.length > 1) {
          router.back();
        } else {
          router.push("/board");
        }
      }}
    >
      ← Back
    </Button>
  );
};

export default BackButton;
