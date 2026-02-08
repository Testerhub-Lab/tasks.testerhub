"use client";

import React from "react";
import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";

type ProjectOption = { id: string; name: string; key: string };

interface SidebarClientProps {
  projects: ProjectOption[];
}

const getBasePath = (pathname: string) => {
  if (pathname.startsWith("/board")) return "/board";
  if (pathname.startsWith("/backlog")) return "/backlog";
  if (pathname.startsWith("/issues")) return "/issues";
  return "/board";
};

const SidebarClient: React.FC<SidebarClientProps> = ({ projects }) => {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const basePath = getBasePath(pathname);
  const activeProjectId = searchParams.get("projectId");

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
        <div className="sidebar__title">Workspace</div>
        <nav className="sidebar__list">
          <Link
            href="/issues"
            className={`sidebar__item ${pathname.startsWith("/issues") ? "is-active" : ""}`}
          >
            All issues
          </Link>
          <Link
            href="/board"
            className={`sidebar__item ${pathname.startsWith("/board") ? "is-active" : ""}`}
          >
            Board
          </Link>
          <Link
            href="/backlog"
            className={`sidebar__item ${pathname.startsWith("/backlog") ? "is-active" : ""}`}
          >
            Backlog
          </Link>
        </nav>
      </div>

      <div className="sidebar__section">
        <div className="sidebar__title">Projects</div>
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
      </div>
    </aside>
  );
};

export default SidebarClient;
