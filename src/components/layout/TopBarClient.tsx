"use client";

import React, { useEffect, useState } from "react";
import { LayoutGroup, motion } from "framer-motion";
import Link from "next/link";
import Image from "next/image";
import { usePathname, useRouter } from "next/navigation";
import Button from "../ui/Button";
import Input from "../ui/Input";
import CreateTaskModal from "../modals/CreateTaskModal";
import { createTaskAction } from "../../server/actions/tasks";
import { useDebouncedQueryParam } from "../../hooks/useDebouncedQueryParam";

const tabs = [
  { label: "Board", href: "/board" },
  { label: "Backlog", href: "/backlog" },
  { label: "List", href: "/issues" },
];

interface TopBarClientProps {
  projects: Array<{ id: string; name: string; key: string }>;
}

const TopBarClient: React.FC<TopBarClientProps> = ({ projects }) => {
  const pathname = usePathname();
  const router = useRouter();

  const [isModalOpen, setModalOpen] = useState(false);
  const [isSubmitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  // ✅ стабильный паттерн state↔URL для поиска
  const q = useDebouncedQueryParam({ key: "q", debounceMs: 300, scroll: false });

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
                  href={tab.href}
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
            type="text"
            placeholder="Search issues"
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
      />
    </header>
  );
};

export default TopBarClient;
