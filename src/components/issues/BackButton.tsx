"use client";

import React from "react";
import { usePathname, useSearchParams } from "next/navigation";
import {
  buildProjectIssueViewHref,
  buildIssueViewHref,
  type IssueViewPath,
} from "@/shared/issueNavigation";
import { getProjectKeyFromPathname } from "@/shared/projectKeyRoutes";

const BackButton: React.FC = () => {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const projectKey = getProjectKeyFromPathname(pathname);
  const from = searchParams.get("from");
  const targetView: IssueViewPath =
    from === "list" ? "/issues" : from === "backlog" ? "/backlog" : "/board";
  const href = projectKey
    ? buildProjectIssueViewHref(projectKey, targetView, searchParams)
    : buildIssueViewHref(targetView, searchParams);

  return (
    <a
      href={href}
      className="button button--ghost h-7 px-2 text-xs text-white/70 hover:text-white"
    >
      ← Back
    </a>
  );
};

export default BackButton;
