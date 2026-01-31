"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import { LayoutGroup, motion } from "framer-motion";
import Link from "next/link";
import Image from "next/image";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import Button from "../ui/Button";
import Input from "../ui/Input";
import CreateTaskModal from "../modals/CreateTaskModal";
import { createTaskAction } from "../../server/actions/tasks";
import { useDebouncedQueryParam } from "../../hooks/useDebouncedQueryParam";
import { ISSUE_FILTER_QUERY_KEYS } from "../../shared/issueFilterQueryKeys";

const tabs = [
  { label: "Board", href: "/board" },
  { label: "Backlog", href: "/backlog" },
  { label: "List", href: "/issues" },
];

type ProjectOption = { id: string; name: string; key: string };
type UserOption = { id: string; name: string | null; email: string };

interface TopBarClientProps {
  projects: ProjectOption[];
  users: UserOption[];
}

const TopBarClient: React.FC<TopBarClientProps> = ({ projects, users }) => {
  const pathname = usePathname();
  const router = useRouter();
  const searchRef = useRef<HTMLInputElement | null>(null);

  const [isModalOpen, setModalOpen] = useState(false);
  const [isSubmitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const q = useDebouncedQueryParam({ key: "q", debounceMs: 300, scroll: false });
  const searchParams = useSearchParams();

  const allowedQuery = useMemo(() => {
    const params = new URLSearchParams();

    for (const key of ISSUE_FILTER_QUERY_KEYS) {
      const value = searchParams.get(key);
      if (value) params.set(key, value);
    }

    const query = params.toString();
    return query ? `?${query}` : "";
  }, [searchParams]);

  const openModal = () => {
    setFormError(null);
    setModalOpen(true);
  };
  const closeModal = () => {
    setFormError(null);
    setModalOpen(false);
  };

  useEffect(() => {
    const handleOpen = () => openModal();
    window.addEventListener("open-create-modal", handleOpen);
    return () => {
      window.removeEventListener("open-create-modal", handleOpen);
    };
  }, []);

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
        setFormError(result.formError ?? "Не удалось создать тикет.");
        return;
      }
      closeModal();
      router.refresh();
    } catch (error) {
      console.error(error);
      setFormError("Произошла ошибка при создании тикета.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <header className="topbar">
      <div className="topbar__left">
        <div className="flex items-center gap-3">
          <Image src="/next.svg" alt="Logo" width={28} height={28} />
          <span className="text-sm font-semibold tracking-wide text-white">
            TesterHub
          </span>
        </div>

        <LayoutGroup id="topbar-tabs">
          <nav className="relative inline-flex flex-nowrap items-center gap-1 rounded-full border border-white/10 p-1 overflow-hidden">
            {tabs.map((tab) => {
              const isActive = pathname === tab.href;

              return (
                <Link
                  key={tab.href}
                  href={`${tab.href}${allowedQuery}`}
                  aria-current={isActive ? "page" : undefined}
                  className={[
                    "relative inline-flex h-8 items-center justify-center rounded-full px-3 text-sm",
                    "transition-colors select-none",
                    isActive ? "text-white" : "text-slate-200/90 hover:bg-white/5",
                    "focus:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400/40",
                  ].join(" ")}
                >
                  {isActive ? (
                    <motion.div
                      layoutId="topbar-tab-indicator"
                      className="absolute -inset-px rounded-full border border-cyan-400/60 bg-white/5 shadow-[0_0_12px_rgba(34,211,238,0.35)] backdrop-blur-md pointer-events-none"
                      transition={{ type: "spring", stiffness: 500, damping: 35 }}
                    />
                  ) : null}

                  <span className="relative z-10">{tab.label}</span>
                </Link>
              );
            })}
          </nav>
        </LayoutGroup>
      </div>

      <div className="topbar__right">
        <div className="topbar__search">
          <Input
            ref={searchRef}
            type="text"
            placeholder="Search issues ( / )"
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

        <Button variant="primary" onClick={openModal}>
          Create
        </Button>
      </div>

      <CreateTaskModal
        isOpen={isModalOpen}
        onClose={closeModal}
        onSubmit={handleCreateTask}
        loading={isSubmitting}
        errorMessage={formError}
        projects={projects}
        users={users}
      />
    </header>
  );
};

export default TopBarClient;
