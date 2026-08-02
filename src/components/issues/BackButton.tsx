"use client";

import React from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Button from "../ui/Button";
import { buildIssueViewHref } from "@/shared/issueNavigation";

const BackButton: React.FC = () => {
  const router = useRouter();
  const searchParams = useSearchParams();

  return (
    <Button
      type="button"
      variant="ghost"
      className="h-7 px-2 text-xs text-white/70 hover:text-white"
      onClick={() => {
        if (window.history.length > 1) {
          router.back();
        } else {
          router.push(buildIssueViewHref("/board", searchParams));
        }
      }}
    >
      ← Back
    </Button>
  );
};

export default BackButton;
