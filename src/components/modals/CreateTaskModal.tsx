"use client";

import React, { ChangeEvent, useEffect, useState } from "react";
import { createPortal } from "react-dom";
import Input from "../ui/Input";
import Textarea from "../ui/Textarea";
import Select from "../ui/Select";
import Button from "../ui/Button";
import type { TaskInput } from "@/server/validators/task";

interface CreateTaskModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSubmit?: (data: TaskInput) => Promise<void> | void;
  loading?: boolean;
  errorMessage?: string | null;
  projects: Array<{ id: string; name: string; key: string }>;
}

const CreateTaskModal: React.FC<CreateTaskModalProps> = ({
  isOpen,
  onClose,
  onSubmit,
  loading = false,
  errorMessage,
  projects,
}) => {
  const [isMounted, setMounted] = useState(false);
  const [formData, setFormData] = useState<TaskInput>({
    projectId: "",
    type: "Bug",
    title: "",
    description: "",
    steps: "",
    expected: "",
    actual: "",
    priority: "Medium",
    tags: "",
    environment: "",
  });
  const [files, setFiles] = useState<File[]>([]);
  const [isUploading, setUploading] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!projects.length) {
      return;
    }
    setFormData((prev) => {
      if (prev.projectId) {
        return prev;
      }
      return { ...prev, projectId: projects[0].id };
    });
  }, [projects]);

  useEffect(() => {
    if (!isOpen) {
      return;
    }
    const originalOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = originalOverflow;
    };
  }, [isOpen]);

  const handleChange = (
    e: ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>
  ) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
  };

  const uploadFiles = async () => {
    if (!files.length) {
      return [] as string[];
    }

    const body = new FormData();
    files.forEach((file) => body.append("files", file));

    const response = await fetch("/api/uploads", {
      method: "POST",
      body,
    });

    if (!response.ok) {
      throw new Error("Upload failed");
    }

    const result = (await response.json()) as { files: string[] };
    return result.files ?? [];
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (onSubmit) {
      try {
        setUploading(true);
        const uploaded = await uploadFiles();
        await onSubmit({ ...formData, attachments: uploaded });
      } finally {
        setUploading(false);
      }
    } else {
      onClose();
    }
  };

  if (!isOpen) {
    return null;
  }

  if (!isMounted) {
    return null;
  }

  return createPortal(
    <div className="fixed inset-0 z-50" role="dialog" aria-modal="true">
      <div
        className="fixed inset-0 bg-[rgba(8,12,24,0.7)]"
        onClick={onClose}
      />
      <div className="fixed inset-0 flex items-center justify-center p-4 max-md:items-start max-md:pt-16">
        <div
          className="w-full max-w-2xl max-h-[85vh] overflow-y-auto rounded-2xl border border-[var(--color-card-border)] bg-[rgba(18,24,46,0.95)] p-6 shadow-[0_20px_60px_rgba(0,0,0,0.45)]"
          onClick={(event) => event.stopPropagation()}
        >
          <div className="mb-4">
            <h2 className="text-2xl font-semibold">Новый тикет</h2>
            <p className="text-sm text-[var(--color-text-secondary)]">
              Минимальный набор, чтобы команда могла быстро воспроизвести и
              исправить.
            </p>
          </div>
          {errorMessage ? (
            <div className="text-sm text-[var(--color-error)]">
              {errorMessage}
            </div>
          ) : null}
          <form onSubmit={handleSubmit} className="grid gap-4">
            <label className="space-y-2 text-sm text-[var(--color-text-secondary)]">
              <span className="font-medium text-white">Проект</span>
              <Select
                name="projectId"
                value={formData.projectId}
                onChange={handleChange}
                disabled={projects.length <= 1}
                options={projects.map((project) => ({
                  value: project.id,
                  label: `${project.key} — ${project.name}`,
                }))}
              />
            </label>
            <label className="space-y-2 text-sm text-[var(--color-text-secondary)]">
              <span className="font-medium text-white">Тип</span>
              <Select
                name="type"
                value={formData.type}
                onChange={handleChange}
                options={[
                  { value: "Bug", label: "Баг" },
                  { value: "Task", label: "Таск" },
                ]}
              />
            </label>
            <label className="space-y-2 text-sm text-[var(--color-text-secondary)]">
              <span className="font-medium text-white">Заголовок</span>
              <Input
                type="text"
                name="title"
                placeholder="Коротко: что сломалось"
                value={formData.title}
                onChange={handleChange}
                required
              />
            </label>
            <label className="space-y-2 text-sm text-[var(--color-text-secondary)]">
              <span className="font-medium text-white">Описание</span>
              <Textarea
                name="description"
                placeholder="Контекст, где это происходит"
                value={formData.description}
                onChange={handleChange}
              />
            </label>
            <label className="space-y-2 text-sm text-[var(--color-text-secondary)]">
              <span className="font-medium text-white">Шаги воспроизведения</span>
              <Textarea
                name="steps"
                placeholder="1) ... 2) ... 3) ..."
                value={formData.steps}
                onChange={handleChange}
              />
            </label>
            <div className="grid gap-4 md:grid-cols-2">
              <label className="space-y-2 text-sm text-[var(--color-text-secondary)]">
                <span className="font-medium text-white">Ожидаемое</span>
                <Textarea
                  name="expected"
                  placeholder="Что должно было произойти"
                  value={formData.expected}
                  onChange={handleChange}
                />
              </label>
              <label className="space-y-2 text-sm text-[var(--color-text-secondary)]">
                <span className="font-medium text-white">Фактическое</span>
                <Textarea
                  name="actual"
                  placeholder="Что произошло на самом деле"
                  value={formData.actual}
                  onChange={handleChange}
                />
              </label>
            </div>
            <div className="grid gap-4 md:grid-cols-2">
              <label className="space-y-2 text-sm text-[var(--color-text-secondary)]">
                <span className="font-medium text-white">Приоритет</span>
                <Select
                  name="priority"
                  value={formData.priority}
                  onChange={handleChange}
                  options={[
                    { value: "Low", label: "Низкий" },
                    { value: "Medium", label: "Средний" },
                    { value: "High", label: "Высокий" },
                  ]}
                />
              </label>
              <label className="space-y-2 text-sm text-[var(--color-text-secondary)]">
                <span className="font-medium text-white">Окружение</span>
                <Input
                  type="text"
                  name="environment"
                  placeholder="Браузер, версия, устройство"
                  value={formData.environment}
                  onChange={handleChange}
                />
              </label>
            </div>
            <label className="space-y-2 text-sm text-[var(--color-text-secondary)]">
              <span className="font-medium text-white">Метки</span>
              <Input
                type="text"
                name="tags"
                placeholder="Например: ui, auth, regression"
                value={formData.tags}
                onChange={handleChange}
              />
            </label>
            <label className="space-y-2 text-sm text-[var(--color-text-secondary)]">
              <span className="font-medium text-white">Скриншоты и файлы</span>
              <input
                type="file"
                multiple
                className="input"
                onChange={(event) =>
                  setFiles(Array.from(event.target.files ?? []))
                }
              />
              {files.length ? (
                <div className="text-xs text-[var(--color-text-secondary)]">
                  Выбрано файлов: {files.length}
                </div>
              ) : null}
            </label>
            <div className="flex justify-end gap-3 pt-2">
              <Button
                type="button"
                variant="secondary"
                onClick={onClose}
                disabled={loading || isUploading}
              >
                Отмена
              </Button>
            <Button
              type="submit"
              variant="primary"
              disabled={loading || isUploading || !formData.projectId}
            >
              {isUploading ? "Загрузка..." : "Создать"}
            </Button>
            </div>
          </form>
        </div>
      </div>
    </div>,
    document.body
  );
};

export default CreateTaskModal;
