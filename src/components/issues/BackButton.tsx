"use client";

import React from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import Button from "../ui/Button";
import {
  buildProjectIssueViewHref,
  buildIssueViewHref,
} from "@/shared/issueNavigation";
import { getProjectKeyFromPathname } from "@/shared/projectKeyRoutes";

const BackButton: React.FC = () => {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const projectKey = getProjectKeyFromPathname(pathname);

  return (
    <Button
      type="button"
      variant="ghost"
      className="h-7 px-2 text-xs text-white/70 hover:text-white"
      onClick={() => {
        if (window.history.length > 1) {
          router.back();
        } else {
          router.push(
            projectKey
              ? buildProjectIssueViewHref(projectKey, "/board", searchParams)
              : buildIssueViewHref("/board", searchParams)
          );
        }
      }}
    >
      ← Back
    </Button>
  );
};

export default BackButton;
