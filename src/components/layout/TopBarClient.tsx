"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { usePathname, useRouter } from "next/navigation";
import Button from "../ui/Button";
import Input from "../ui/Input";
import CreateTaskModal from "../modals/CreateTaskModal";
import { createTaskAction } from "../../server/actions/tasks";

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
        <nav className="topbar__tabs">
          {tabs.map((tab) => {
            const isActive = pathname === tab.href;
            return (
              <Link
                key={tab.href}
                href={tab.href}
                className={`topbar__tab ${isActive ? "topbar__tab--active" : ""}`}
              >
                {tab.label}
              </Link>
            );
          })}
        </nav>
      </div>
      <div className="topbar__right">
        <div className="topbar__search">
          <Input type="text" placeholder="Search issues" />
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
