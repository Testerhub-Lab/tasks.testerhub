"use client";

import React, { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { setWorkspaceAction } from "@/server/actions/workspaces";

type ProjectOption = { id: string; name: string; key: string };
type WorkspaceOption = { id: string; name: string; slug: string };

interface SidebarClientProps {
  projects: ProjectOption[];
  backlogUnread: number;
  workspaces: WorkspaceOption[];
  currentWorkspaceId: string;
  canManageWorkspace: boolean;
}

const getBasePath = (pathname: string) => {
  if (pathname.startsWith("/board")) return "/board";
  if (pathname.startsWith("/backlog")) return "/backlog";
  if (pathname.startsWith("/issues")) return "/issues";
  return "/board";
};

const SidebarClient: React.FC<SidebarClientProps> = ({
  projects,
  backlogUnread,
  workspaces,
  currentWorkspaceId,
  canManageWorkspace,
}) => {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const basePath = getBasePath(pathname);
  const activeProjectId = searchParams.get("projectId");
  const activeAssignee = searchParams.get("assignee");
  const isSettingsWorkspace = pathname.startsWith("/settings/workspace");
  const settingsTab = searchParams.get("tab");
  const showBacklogBadge = !pathname.startsWith("/backlog") && backlogUnread > 0;
  const [workspaceOpen, setWorkspaceOpen] = useState(false);
  const workspaceRef = useRef<HTMLDivElement | null>(null);

  const handleWorkspaceChange = async (nextId: string) => {
    if (nextId === currentWorkspaceId) return;
    const result = await setWorkspaceAction(nextId);
    if (result.ok) {
      setWorkspaceOpen(false);
      window.location.href = basePath;
    }
  };

  const buildIssuesHref = (assignee?: string | null) => {
    const params = new URLSearchParams(searchParams.toString());
    if (assignee) params.set("assignee", assignee);
    else params.delete("assignee");
    const query = params.toString();
    return query ? `/issues?${query}` : "/issues";
  };

  const buildStatusHref = (statuses: string[]) => {
    const params = new URLSearchParams(searchParams.toString());
    params.delete("status");
    statuses.forEach((status) => params.append("status", status));
    const query = params.toString();
    return query ? `/issues?${query}` : "/issues";
  };

  const buildHref = (projectId?: string | null) => {
    const params = new URLSearchParams(searchParams.toString());
    if (projectId) {
      params.set("projectId", projectId);
    } else {
      params.delete("projectId");
    }
    const query = params.toString();
    return query ? `${basePath}?${query}` : basePath;
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
          onClick={() => setWorkspaceOpen((v) => !v)}
          aria-expanded={workspaceOpen}
        >
            <span className="sidebar__workspace-avatar">
              {(workspaces.find((ws) => ws.id === currentWorkspaceId)?.name ?? "WS")
                .slice(0, 2)
                .toUpperCase()}
            </span>
            <span className="sidebar__workspace-name">
              {workspaces.find((ws) => ws.id === currentWorkspaceId)?.name ?? "Workspace"}
            </span>
            <span className="sidebar__workspace-caret">▾</span>
        </button>
        {workspaceOpen ? (
          <div className="sidebar__workspace-menu">
            {canManageWorkspace ? (
              <Link
                href="/settings/workspace"
                className="sidebar__menu-item"
                onClick={() => setWorkspaceOpen(false)}
              >
                Workspace settings
              </Link>
            ) : null}
            {canManageWorkspace ? (
              <Link
                href="/settings/workspace#members"
                className="sidebar__menu-item"
                onClick={() => setWorkspaceOpen(false)}
              >
                Invite and manage members
              </Link>
            ) : null}
            {workspaces.length > 1 ? (
              <div className="sidebar__menu-group">
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
        ) : null}
      </div>

      <div className="sidebar__section">
        <div className="sidebar__title">Views</div>
        <nav className="sidebar__list">
          <Link
            href="/backlog"
            className={`sidebar__item ${pathname.startsWith("/backlog") ? "is-active" : ""}`}
          >
            <span className="sidebar__icon">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6">
                <path d="M4 6h16" />
                <path d="M4 12h10" />
                <path d="M4 18h8" />
              </svg>
            </span>
            <span>Inbox</span>
            {showBacklogBadge ? (
              <span className="sidebar__badge">+{backlogUnread}</span>
            ) : null}
          </Link>
          <Link
            href={buildIssuesHref("me")}
            className={`sidebar__item ${
              pathname.startsWith("/issues") && activeAssignee === "me" ? "is-active" : ""
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
            href="/issues"
            className={`sidebar__item ${
              pathname.startsWith("/issues") || pathname.startsWith("/board") ? "is-active" : ""
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
            href="/settings/workspace?tab=projects#projects"
            className={`sidebar__item ${
              isSettingsWorkspace && settingsTab === "projects" ? "is-active" : ""
            }`}
          >
            <span className="sidebar__icon">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6">
                <path d="M4 7h16v10H4z" />
                <path d="M9 7v10" />
              </svg>
            </span>
            <span>Projects</span>
          </Link>
          <Link
            href="/settings/workspace?tab=members#members"
            className={`sidebar__item ${
              isSettingsWorkspace && settingsTab === "members" ? "is-active" : ""
            }`}
          >
            <span className="sidebar__icon">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6">
                <circle cx="8" cy="9" r="3" />
                <circle cx="16" cy="9" r="3" />
                <path d="M3 20c1.4-3 8.6-3 10 0" />
                <path d="M11 20c1.2-2.6 7.8-2.6 10 0" />
              </svg>
            </span>
            <span>Members</span>
          </Link>
        </nav>
      </div>

      <div className="sidebar__section">
        <div className="sidebar__title">Filters</div>
        <nav className="sidebar__list">
          <Link
            href={buildIssuesHref("me")}
            className="sidebar__item"
          >
            <span className="sidebar__icon">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6">
                <path d="M4 5h16l-6 7v5l-4 2v-7z" />
              </svg>
            </span>
            <span>Assigned to me</span>
          </Link>
          <Link
            href={buildStatusHref(["TODO", "IN_PROGRESS", "TESTING", "HOLD"])}
            className="sidebar__item"
          >
            <span className="sidebar__icon">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6">
                <path d="M5 12h14" />
                <path d="M12 5v14" />
              </svg>
            </span>
            <span>Open only</span>
          </Link>
        </nav>
      </div>

      <div className="sidebar__section">
        <details className="sidebar__disclosure">
          <summary className="sidebar__title sidebar__disclosure-toggle sidebar__section-toggle">
            <span>
              Projects
              <span className="sidebar__count">{projects.length}</span>
            </span>
            <span className="sidebar__caret">▾</span>
          </summary>
          <nav className="sidebar__list sidebar__projects-list">
            <Link
              href={buildHref(null)}
              className={`sidebar__item ${!activeProjectId ? "is-active" : ""}`}
            >
              All projects
            </Link>
            {projects.map((project) => (
              <Link
                key={project.id}
                href={buildHref(project.id)}
                className={`sidebar__item ${activeProjectId === project.id ? "is-active" : ""}`}
                title={`${project.key} — ${project.name}`}
              >
                <span className="sidebar__project-key">{project.key}</span>
                <span className="sidebar__project-name">{project.name}</span>
              </Link>
            ))}
          </nav>
        </details>
      </div>

    </aside>
  );
};

export default SidebarClient;
