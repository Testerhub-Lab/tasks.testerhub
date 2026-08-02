"use client";

import React, { useEffect, useMemo, useRef, useState, useTransition } from "react";
import Image from "next/image";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import Button from "../ui/Button";
import Input from "../ui/Input";
import CreateTaskModal from "../modals/CreateTaskModal";
import { createTaskAction } from "../../server/actions/tasks";
import { useDebouncedQueryParam } from "../../hooks/useDebouncedQueryParam";
import {
  buildProjectIssueViewHref,
  buildIssueViewHref,
  type IssueViewPath,
} from "../../shared/issueNavigation";
import { saveIssueViewPreferenceAction } from "@/server/actions/issueViewPreferences";
import {
  issueViewPathToLayout,
  resolveIssueViewScope,
  type IssueViewLayout,
} from "@/shared/issueViews";
import { findProjectByRouteContext } from "@/shared/projectKeyRoutes";
import { isAuthRequiredError, showAuthRequiredToast } from "@/lib/authRequired";
import { getDisplayName } from "@/server/auth/displayName";
import { useAuth } from "@/lib/auth/useAuth";
import type { TaskStatus } from "@/server/validators/task";

const viewTabs: Array<{ label: string; href: IssueViewPath; layout: IssueViewLayout }> = [
  { label: "Board", href: "/board", layout: "board" },
  { label: "List", href: "/issues", layout: "list" },
];

type ProjectOption = {
  id: string;
  name: string;
  key: string;
  canWrite: boolean;
};
type UserOption = { id: string; name: string | null; email: string };
type OpenCreateModalDetail = {
  projectId?: string | null;
  status?: TaskStatus | null;
};

interface TopBarClientProps {
  projects: ProjectOption[];
  users: UserOption[];
}

const TopBarClient: React.FC<TopBarClientProps> = ({
  projects,
  users,
}) => {
  const pathname = usePathname();
  const router = useRouter();
  const searchRef = useRef<HTMLInputElement | null>(null);

  const [isModalOpen, setModalOpen] = useState(false);
  const [initialProjectId, setInitialProjectId] = useState<string | null>(null);
  const [initialStatus, setInitialStatus] = useState<TaskStatus | null>(null);
  const [isSubmitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [isUserMenuOpen, setUserMenuOpen] = useState(false);
  const [, startViewPreferenceTransition] = useTransition();
  const { user, loading, refresh } = useAuth();
  const writableProjects = useMemo(
    () => projects.filter((project) => project.canWrite),
    [projects]
  );

  const q = useDebouncedQueryParam({ key: "q", debounceMs: 300, scroll: false });
  const searchParams = useSearchParams();
  const activeProject = useMemo(
    () =>
      findProjectByRouteContext(projects, {
        pathname,
        projectId: searchParams.get("projectId"),
      }),
    [pathname, projects, searchParams]
  );

  const currentPath = useMemo(() => {
    const qs = searchParams.toString();
    return qs ? `${pathname}?${qs}` : pathname;
  }, [pathname, searchParams]);
  const signInUrl = useMemo(
    () => `/signin?redirect=${encodeURIComponent(currentPath)}`,
    [currentPath]
  );

  const openModal = () => {
    setFormError(null);
    setInitialProjectId(activeProject?.id ?? searchParams.get("projectId"));
    setInitialStatus(null);
    setModalOpen(true);
  };
  const closeModal = () => {
    setFormError(null);
    setModalOpen(false);
    setInitialProjectId(null);
    setInitialStatus(null);
  };

  useEffect(() => {
    const handleOpen = (event: Event) => {
      const detail = (event as CustomEvent<OpenCreateModalDetail>).detail;
      setFormError(null);
      setInitialProjectId(detail?.projectId ?? null);
      setInitialStatus(detail?.status ?? null);
      setModalOpen(true);
    };
    window.addEventListener("open-create-modal", handleOpen);
    return () => {
      window.removeEventListener("open-create-modal", handleOpen);
    };
  }, []);

  useEffect(() => {
    const createParam = searchParams.get("create");
    if (createParam !== "1") return;
    const targetProjectId = searchParams.get("createProjectId");
    if (targetProjectId) {
      setInitialProjectId(targetProjectId);
    }
    setModalOpen(true);

    const params = new URLSearchParams(searchParams.toString());
    params.delete("create");
    params.delete("createProjectId");
    const query = params.toString();
    router.replace(query ? `${pathname}?${query}` : pathname, { scroll: false });
  }, [searchParams, pathname, router]);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      const isCmdK = (e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k";
      const isSlash = e.key === "/";

      if (!isCmdK && !isSlash) return;

      const target = e.target as HTMLElement | null;
      const tag = target?.tagName?.toLowerCase();
      const isTypingContext =
        tag === "input" || tag === "textarea" || target?.isContentEditable;

      if (isTypingContext) return;

      e.preventDefault();
      searchRef.current?.focus();
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  const handleCreateTask = async (data: Parameters<typeof createTaskAction>[0]) => {
    setSubmitting(true);
    setFormError(null);
    try {
      const result = await createTaskAction(data);
      if (!result.ok) {
        if (isAuthRequiredError({ formError: result.formError ?? null })) {
          showAuthRequiredToast();
          return result;
        }
        setFormError(result.formError ?? "Не удалось создать тикет.");
        return result;
      }
      return result;
    } catch (error) {
      console.error(error);
      setFormError("Произошла ошибка при создании тикета.");
      return {
        ok: false as const,
        formError: "Произошла ошибка при создании тикета.",
      };
    } finally {
      setSubmitting(false);
    }
  };

  const handleLogout = async () => {
    try {
      const { clearZeroClientDataOnLogout } = await import("@/zero/logout");
      await clearZeroClientDataOnLogout();
    } catch (error) {
      console.error("Failed to clear local Zero data during logout", error);
    }
    await fetch("/api/auth/logout", { method: "POST" }).catch(() => null);
    setUserMenuOpen(false);
    await refresh();
    router.refresh();
  };

  const saveLayoutPreference = (layout: IssueViewLayout) => {
      const scope = resolveIssueViewScope({
      projectId: activeProject?.id ?? searchParams.get("projectId"),
      assignee: searchParams.get("assignee"),
    });

    startViewPreferenceTransition(() => {
      void saveIssueViewPreferenceAction({
        ...scope,
        layout,
      }).catch((error) => {
        console.error("Failed to save issue view preference", error);
      });
    });
  };

  const activeLayout = issueViewPathToLayout(pathname);

  return (
    <header className="topbar">
      <div className="topbar__left">
        <div className="flex items-center gap-3">
          <Image src="/next.svg" alt="Logo" width={28} height={28} />
          <span className="text-sm font-semibold tracking-wide text-white">
            TesterHub
          </span>
        </div>

        <nav className="inline-flex items-center gap-1 rounded-md border border-white/10 p-1">
          {viewTabs.map((tab) => {
            const isActive = activeLayout === tab.layout;
            const href = activeProject
              ? buildProjectIssueViewHref(activeProject.key, tab.href, searchParams)
              : buildIssueViewHref(tab.href, searchParams);
            return (
              <Link
                key={tab.href}
                href={href}
                onClick={(event) => {
                  event.preventDefault();
                  router.push(href);
                  saveLayoutPreference(tab.layout);
                }}
                aria-current={isActive ? "page" : undefined}
                className={[
                  "inline-flex h-7 items-center justify-center rounded-sm px-2 text-xs",
                  isActive ? "text-white bg-white/10" : "text-white/70 hover:bg-white/5",
                ].join(" ")}
              >
                {tab.label}
              </Link>
            );
          })}
        </nav>

      </div>

      <div className="topbar__right">
        <div className="topbar__search">
          <Input
            ref={searchRef}
            type="text"
            placeholder="Search issues  ⌘/"
            value={q.value}
            onChange={(event) => q.setValue(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                event.preventDefault();
                q.flush();
              }
              if (event.key === "Escape") {
                event.preventDefault();
                q.resetToUrl();
                (event.currentTarget as HTMLInputElement).blur();
              }
            }}
          />
        </div>

        <Button
          variant="primary"
          onClick={openModal}
          className="cursor-pointer"
          disabled={writableProjects.length === 0}
        >
          Create
        </Button>

        {loading ? (
          <div className="ml-2 h-9 w-28 rounded-full border border-white/10 bg-white/5 animate-pulse" />
        ) : user ? (
          <div className="relative">
            <button
              type="button"
              onClick={() => setUserMenuOpen((v) => !v)}
              className="ml-2 inline-flex h-9 items-center rounded-md border border-white/10 px-3 text-sm text-slate-200/90 hover:bg-white/5 cursor-pointer"
            >
              {getDisplayName({ user, fallbackName: null })}
            </button>
            {isUserMenuOpen ? (
              <div className="absolute right-0 mt-2 w-40 rounded-lg border border-white/10 bg-slate-950/90 p-1 shadow-lg backdrop-blur">
                <Link
                  href="/settings/integrations"
                  onClick={() => setUserMenuOpen(false)}
                  className="block w-full rounded-md px-3 py-2 text-left text-sm text-slate-200/90 hover:bg-white/5"
                >
                  API и интеграции
                </Link>
                <button
                  type="button"
                  onClick={handleLogout}
                  className="w-full rounded-md px-3 py-2 text-left text-sm text-slate-200/90 hover:bg-white/5 cursor-pointer"
                >
                  Logout
                </button>
              </div>
            ) : null}
          </div>
        ) : (
          <div className="ml-2 flex items-center gap-2">
            <Button
              variant="secondary"
              onClick={() => {
                window.location.href = signInUrl;
              }}
            >
              Sign in
            </Button>
            <span className="rounded-full border border-white/10 bg-white/5 px-2 py-0.5 text-[11px] text-white/70">
              Гость
            </span>
          </div>
        )}
      </div>

      <CreateTaskModal
        isOpen={isModalOpen}
        onClose={closeModal}
        onSubmit={handleCreateTask}
        loading={isSubmitting}
        errorMessage={formError}
        projects={writableProjects}
        users={users}
        initialProjectId={initialProjectId}
        initialStatus={initialStatus}
      />
    </header>
  );
};

export default TopBarClient;
