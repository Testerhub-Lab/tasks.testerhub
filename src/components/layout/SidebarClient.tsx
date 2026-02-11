"use client";

import React from "react";
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

  const handleWorkspaceChange = async (nextId: string) => {
    if (nextId === currentWorkspaceId) return;
    const result = await setWorkspaceAction(nextId);
    if (result.ok) {
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

  return (
    <aside className="app-sidebar">
      <div className="sidebar__section">
        <details className="sidebar__workspace" open>
          <summary className="sidebar__workspace-trigger">
            <span className="sidebar__workspace-avatar">
              {(workspaces.find((ws) => ws.id === currentWorkspaceId)?.name ?? "WS")
                .slice(0, 2)
                .toUpperCase()}
            </span>
            <span className="sidebar__workspace-name">
              {workspaces.find((ws) => ws.id === currentWorkspaceId)?.name ?? "Workspace"}
            </span>
            <span className="sidebar__workspace-caret">▾</span>
          </summary>
          <div className="sidebar__workspace-menu">
            {canManageWorkspace ? (
              <Link href="/settings/workspace" className="sidebar__menu-item">
                Workspace settings
              </Link>
            ) : null}
            {canManageWorkspace ? (
              <Link href="/settings/workspace#members" className="sidebar__menu-item">
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
        </details>
      </div>

      <div className="sidebar__section">
        <nav className="sidebar__list">
          <Link
            href="/backlog"
            className={`sidebar__item ${pathname.startsWith("/backlog") ? "is-active" : ""}`}
          >
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
            My issues
          </Link>
        </nav>
      </div>

      <div className="sidebar__section">
        <details className="sidebar__disclosure" open>
          <summary className="sidebar__title sidebar__disclosure-toggle sidebar__section-toggle">
            <span>Workspace</span>
            <span className="sidebar__caret">▾</span>
          </summary>
          <nav className="sidebar__list">
            <Link
              href="/settings/workspace?tab=projects#projects"
              className={`sidebar__item ${
                isSettingsWorkspace && settingsTab === "projects" ? "is-active" : ""
              }`}
            >
              Projects
            </Link>
            <Link
              href="/issues"
              className={`sidebar__item ${
                pathname.startsWith("/issues") || pathname.startsWith("/board") ? "is-active" : ""
              }`}
            >
              Issues
            </Link>
            <Link
              href="/settings/workspace?tab=members#members"
              className={`sidebar__item ${
                isSettingsWorkspace && settingsTab === "members" ? "is-active" : ""
              }`}
            >
              Members
            </Link>
          </nav>
        </details>
      </div>

      <div className="sidebar__section">
        <details className="sidebar__disclosure" open>
          <summary className="sidebar__title sidebar__disclosure-toggle sidebar__section-toggle">
            <span>Projects</span>
            <span className="sidebar__caret">▾</span>
          </summary>
          <nav className="sidebar__list">
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
