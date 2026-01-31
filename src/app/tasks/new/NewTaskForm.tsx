"use client";

import React, { ChangeEvent, useEffect, useState } from "react";
import Input from "../../../components/ui/Input";
import Textarea from "../../../components/ui/Textarea";
import Select from "../../../components/ui/Select";
import Button from "../../../components/ui/Button";
import { z } from "zod";
import { createTaskAction } from "../../../server/actions/tasks";

const taskSchema = z.object({
  projectId: z.string().min(1),
  type: z.enum(["Bug", "Task"]),
  title: z.string().min(3).max(120),
  description: z.string().max(2000).optional(),
  steps: z.string().max(2000).optional(),
  expected: z.string().max(2000).optional(),
  actual: z.string().max(2000).optional(),
  priority: z.enum(["LOW", "MEDIUM", "HIGH", "CRITICAL"]),
  tags: z.string().optional(),
  attachments: z.array(z.string()).optional(),
  environment: z.string().optional(),
});

interface NewTaskFormProps {
  projects: Array<{ id: string; name: string; key: string }>;
}

const NewTaskForm: React.FC<NewTaskFormProps> = ({ projects }) => {
  const [formData, setFormData] = useState({
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

  const handleChange = (
    e: ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>
  ) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
  };

  const [isSubmitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [formSuccess, setFormSuccess] = useState<string | null>(null);

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
    try {
      setSubmitting(true);
      const uploaded = await uploadFiles();
      const validatedData = taskSchema.parse({
        ...formData,
        attachments: uploaded,
      });
      setFormError(null);
      setFormSuccess(null);
      const result = await createTaskAction(validatedData);
      if (!result.ok) {
        setFormError(result.formError ?? "Не удалось создать тикет.");
        return;
      }
      setFormSuccess("Тикет создан.");
      handleReset();
    } catch (error) {
      if (error instanceof z.ZodError) {
        setFormError("Проверьте корректность заполнения формы.");
      } else {
        console.error("Create task error:", error);
        setFormError("Произошла ошибка при создании тикета.");
      }
    } finally {
      setSubmitting(false);
    }
  };

  const handleReset = () => {
    setFormData({
      projectId: projects[0]?.id ?? "",
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
    setFiles([]);
  };

  return (
    <div className="space-y-6">
      <h1 className="text-3xl font-bold">Создать новую задачу</h1>
      {formError ? (
        <div className="text-sm text-[var(--color-error)]">{formError}</div>
      ) : null}
      {formSuccess ? (
        <div className="text-sm text-[var(--color-text-secondary)]">
          {formSuccess}
        </div>
      ) : null}
      <form onSubmit={handleSubmit} className="space-y-4">
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
        <Select
          name="type"
          value={formData.type}
          onChange={handleChange}
          options={[
            { value: "Bug", label: "Баг" },
            { value: "Task", label: "Таск" },
          ]}
        />
        <Input
          type="text"
          name="title"
          placeholder="Заголовок"
          value={formData.title}
          onChange={handleChange}
        />
        <Textarea
          name="description"
          placeholder="Описание"
          value={formData.description}
          onChange={handleChange}
        />
        <Textarea
          name="steps"
          placeholder="Шаги воспроизведения"
          value={formData.steps}
          onChange={handleChange}
        />
        <div className="grid gap-4 md:grid-cols-2">
          <Textarea
            name="expected"
            placeholder="Ожидаемое"
            value={formData.expected}
            onChange={handleChange}
          />
          <Textarea
            name="actual"
            placeholder="Фактическое"
            value={formData.actual}
            onChange={handleChange}
          />
        </div>
        <div className="grid gap-4 md:grid-cols-2">
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
          <Input
            type="text"
            name="environment"
            placeholder="Окружение"
            value={formData.environment}
            onChange={handleChange}
          />
        </div>
        <Input
          type="text"
          name="tags"
          placeholder="Метки (через запятую)"
          value={formData.tags}
          onChange={handleChange}
        />
        <input
          type="file"
          multiple
          className="input"
          onChange={(event) => setFiles(Array.from(event.target.files ?? []))}
        />
        <div className="flex justify-end">
          <Button
            type="submit"
            variant="primary"
            disabled={isSubmitting || !formData.projectId}
          >
            {isSubmitting ? "Сохранение..." : "Создать"}
          </Button>
        </div>
      </form>
    </div>
  );
};

export default NewTaskForm;
