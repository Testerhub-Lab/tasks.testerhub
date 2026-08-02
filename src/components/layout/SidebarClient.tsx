"use client";

import React, { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { setWorkspaceAction } from "@/server/actions/workspaces";
import {
  buildProjectIssueViewHref,
  buildIssueViewHref,
} from "@/shared/issueNavigation";
import {
  resolveIssueViewPath,
  type IssueViewPreference,
} from "@/shared/issueViews";
import {
  buildProjectIssueViewPath,
  findProjectByRouteContext,
} from "@/shared/projectKeyRoutes";

type ProjectOption = { id: string; name: string; key: string };
type WorkspaceOption = { id: string; name: string; slug: string };

interface SidebarClientProps {
  projects: ProjectOption[];
  issueViewPreferences: IssueViewPreference[];
  backlogUnread: number;
  workspaces: WorkspaceOption[];
  currentWorkspaceId: string;
  canManageWorkspace: boolean;
  canManageProjects: boolean;
}

const getBasePath = (pathname: string) => {
  if (/^\/[^/]+\/board(?:\/|$)/.test(pathname)) return "/board";
  if (/^\/[^/]+\/backlog(?:\/|$)/.test(pathname)) return "/backlog";
  if (/^\/[^/]+\/issues(?:\/|$)/.test(pathname)) return "/issues";
  if (pathname.startsWith("/board")) return "/board";
  if (pathname.startsWith("/backlog")) return "/backlog";
  if (pathname.startsWith("/issues")) return "/issues";
  if (pathname.startsWith("/wiki")) return "/wiki";
  return "/board";
};

const SidebarClient: React.FC<SidebarClientProps> = ({
  projects,
  issueViewPreferences,
  backlogUnread,
  workspaces,
  currentWorkspaceId,
  canManageWorkspace,
  canManageProjects,
}) => {
  const pathname = usePathname();
  const router = useRouter();
  const searchParams = useSearchParams();
  const basePath = getBasePath(pathname);
  const activeProject = findProjectByRouteContext(projects, {
    pathname,
    projectId: searchParams.get("projectId"),
  });
  const activeProjectId = activeProject?.id ?? null;
  const activeAssignee = searchParams.get("assignee");
  const isSettingsWorkspace = pathname.startsWith("/settings/workspace");
  const activeWikiProjectKey = pathname.startsWith("/wiki/")
    ? decodeURIComponent(pathname.split("/")[2] ?? "")
    : null;
  const isProjectContext =
    pathname.startsWith("/board") ||
    pathname.startsWith("/backlog") ||
    pathname.startsWith("/issues") ||
    /^\/[^/]+\/(?:board|backlog|issues)(?:\/|$)/.test(pathname) ||
    pathname.startsWith("/wiki");
  const isAllProjectsActive =
    isProjectContext && !activeProjectId && !activeWikiProjectKey;
  const showBacklogBadge = !pathname.startsWith("/backlog") && backlogUnread > 0;
  const isIssueViewPath =
    pathname.startsWith("/issues") ||
    pathname.startsWith("/board") ||
    /^\/[^/]+\/(?:issues|board)(?:\/|$)/.test(pathname);
  const isBacklogPath =
    pathname.startsWith("/backlog") ||
    /^\/[^/]+\/backlog(?:\/|$)/.test(pathname);
  const [workspaceOpen, setWorkspaceOpen] = useState(false);
  const workspaceRef = useRef<HTMLDivElement | null>(null);

  const handleWorkspaceChange = async (nextId: string) => {
    if (nextId === currentWorkspaceId) return;
    const result = await setWorkspaceAction(nextId);
    if (result.ok) {
      setWorkspaceOpen(false);
      router.push(basePath);
      router.refresh();
    }
  };

  const buildIssuesHref = (assignee?: string | null) => {
    const params = new URLSearchParams(searchParams.toString());
    if (assignee) params.set("assignee", assignee);
    else params.delete("assignee");
    const path = resolveIssueViewPath(
      {
        scope: assignee === "me" ? "my" : activeProjectId ? "project" : "all",
        projectId: activeProjectId,
      },
      issueViewPreferences
    );
    return buildProjectIssueViewHref(activeProject?.key, path, params);
  };

  const buildHref = (projectId?: string | null, projectKey?: string) => {
    if (pathname.startsWith("/wiki")) {
      return projectKey ? `/wiki/${encodeURIComponent(projectKey)}` : "/wiki";
    }
    const params = new URLSearchParams(searchParams.toString());
    if (projectId) {
      params.set("projectId", projectId);
    } else {
      params.delete("projectId");
    }
    const targetBasePath =
      basePath === "/issues" || basePath === "/board"
        ? resolveIssueViewPath(
            {
              scope: projectId ? "project" : activeAssignee === "me" ? "my" : "all",
              projectId: projectId ?? null,
            },
            issueViewPreferences
          )
        : basePath;
    if (
      projectKey &&
      (targetBasePath === "/board" || targetBasePath === "/issues")
    ) {
      return buildProjectIssueViewHref(projectKey, targetBasePath, params);
    }
    if (projectKey && targetBasePath === "/backlog") {
      params.delete("projectId");
      const query = params.toString();
      const href = buildProjectIssueViewPath(projectKey, "/backlog");
      return query ? `${href}?${query}` : href;
    }
    const query = params.toString();
    return query ? `${targetBasePath}?${query}` : targetBasePath;
  };

  useEffect(() => {
    const handleClick = (event: MouseEvent) => {
      if (!workspaceRef.current) return;
      if (!workspaceRef.current.contains(event.target as Node)) {
        setWorkspaceOpen(false);
      }
    };
    const handleKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setWorkspaceOpen(false);
    };
    document.addEventListener("mousedown", handleClick);
    document.addEventListener("keydown", handleKey);
    return () => {
      document.removeEventListener("mousedown", handleClick);
      document.removeEventListener("keydown", handleKey);
    };
  }, []);

  return (
    <aside className="app-sidebar">
      <div className="sidebar__section" ref={workspaceRef}>
        <button
          type="button"
          className="sidebar__workspace-trigger"
          onClick={() => {
            if (workspaces.length > 1) setWorkspaceOpen((v) => !v);
          }}
          disabled={workspaces.length <= 1}
          aria-expanded={workspaces.length > 1 ? workspaceOpen : undefined}
        >
            <span className="sidebar__workspace-avatar">
              {(workspaces.find((ws) => ws.id === currentWorkspaceId)?.name ?? "WS")
                .slice(0, 2)
                .toUpperCase()}
            </span>
            <span className="sidebar__workspace-name">
              {workspaces.find((ws) => ws.id === currentWorkspaceId)?.name ?? "Workspace"}
            </span>
            {workspaces.length > 1 ? (
              <span className="sidebar__workspace-caret">▾</span>
            ) : null}
        </button>
        {workspaceOpen && workspaces.length > 1 ? (
          <div className="sidebar__workspace-menu">
            <div className="sidebar__menu-title">Switch workspace</div>
            {workspaces.map((ws) => (
              <button
                key={ws.id}
                type="button"
                className={`sidebar__menu-item ${
                  ws.id === currentWorkspaceId ? "is-active" : ""
                }`}
                onClick={() => handleWorkspaceChange(ws.id)}
              >
                {ws.name}
              </button>
            ))}
          </div>
        ) : null}
      </div>

      <div className="sidebar__section">
        <nav className="sidebar__list">
          <Link
            href={
              activeProject
                ? buildProjectIssueViewHref(activeProject.key, "/backlog", searchParams)
                : buildIssueViewHref("/backlog", searchParams)
            }
            className={`sidebar__item ${isBacklogPath ? "is-active" : ""}`}
          >
            <span className="sidebar__icon">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6">
                <path d="M4 6h16" />
                <path d="M4 12h10" />
                <path d="M4 18h8" />
              </svg>
            </span>
            <span>Backlog</span>
            {showBacklogBadge ? (
              <span className="sidebar__badge">+{backlogUnread}</span>
            ) : null}
          </Link>
          <Link
            href={buildIssuesHref("me")}
            className={`sidebar__item ${
              isIssueViewPath && activeAssignee === "me"
                ? "is-active"
                : ""
            }`}
          >
            <span className="sidebar__icon">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6">
                <circle cx="12" cy="8" r="4" />
                <path d="M6 20c1.6-3.2 9.4-3.2 12 0" />
              </svg>
            </span>
            <span>My issues</span>
          </Link>
          <Link
            href={buildIssuesHref()}
            className={`sidebar__item ${
              isIssueViewPath && activeAssignee !== "me"
                ? "is-active"
                : ""
            }`}
          >
            <span className="sidebar__icon">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6">
                <rect x="4" y="5" width="16" height="14" rx="2" />
                <path d="M8 9h8M8 13h5" />
              </svg>
            </span>
            <span>Issues</span>
          </Link>
          <Link
            href="/wiki"
            className={`sidebar__item ${
              pathname.startsWith("/wiki") ? "is-active" : ""
            }`}
          >
            <span className="sidebar__icon">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6">
                <path d="M5 4h11a3 3 0 0 1 3 3v13H8a3 3 0 0 1-3-3z" />
                <path d="M8 4v16" />
              </svg>
            </span>
            <span>Wiki</span>
          </Link>
        </nav>
      </div>

      <div className="sidebar__section sidebar__projects">
        <div className="sidebar__title sidebar__projects-title">
          <span>Products</span>
          <span className="sidebar__count">{projects.length}</span>
        </div>
        <nav className="sidebar__list sidebar__projects-list">
          {projects.map((project) => {
            const isActive =
              activeProjectId === project.id ||
              activeWikiProjectKey === project.key;
            return (
              <Link
                key={project.id}
                href={buildHref(project.id, project.key)}
                className={`sidebar__item ${isActive ? "is-context-active" : ""}`}
                title={`${project.key} — ${project.name}`}
              >
                <span className="sidebar__project-name">{project.name}</span>
                <span className="sidebar__project-key">
                  {project.key.toUpperCase()}
                </span>
              </Link>
            );
          })}
          <Link
            href={buildHref(null)}
            className={`sidebar__item ${isAllProjectsActive ? "is-context-active" : ""}`}
          >
            <span className="sidebar__icon">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6">
                <rect x="4" y="5" width="16" height="14" rx="2" />
                <path d="M9 5v14M14 5v14" />
              </svg>
            </span>
            <span>All products</span>
          </Link>
        </nav>
      </div>

      <div className="sidebar__footer">
        {canManageWorkspace || canManageProjects ? (
          <Link
            href="/settings/workspace"
            className={`sidebar__item ${isSettingsWorkspace ? "is-active" : ""}`}
          >
            <span className="sidebar__icon">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6">
                <circle cx="12" cy="12" r="3" />
                <path d="M19 12a7 7 0 0 0-.1-1l2-1.5-2-3.4-2.4 1a8 8 0 0 0-1.8-1L14.4 3h-4.8l-.4 3.1a8 8 0 0 0-1.8 1l-2.4-1-2 3.4L5.1 11a7 7 0 0 0 0 2L3 14.5l2 3.4 2.4-1a8 8 0 0 0 1.8 1l.4 3.1h4.8l.4-3.1a8 8 0 0 0 1.8-1l2.4 1 2-3.4-2.1-1.5a7 7 0 0 0 .1-1Z" />
              </svg>
            </span>
            <span>Settings</span>
          </Link>
        ) : null}
        <Link
          href="/trash"
          className={`sidebar__item ${pathname.startsWith("/trash") ? "is-active" : ""}`}
        >
          <span className="sidebar__icon">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6">
              <path d="M4 7h16" />
              <path d="M9 7V5h6v2" />
              <path d="M7 7l1 12h8l1-12" />
            </svg>
          </span>
          <span>Trash</span>
        </Link>
      </div>
    </aside>
  );
};

export default SidebarClient;
