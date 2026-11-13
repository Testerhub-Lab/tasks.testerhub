"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Button from "@/components/ui/Button";
import Input from "@/components/ui/Input";
import { createWikiPageAction } from "@/server/knowledge/actions";
import { toast } from "@/components/ui/toast";

type ParentOption = {
  id: string;
  title: string;
  depth: number;
};

type WikiCreatePageFormProps = {
  projectId: string;
  parents: ParentOption[];
  initialParentId?: string;
};

export default function WikiCreatePageForm({
  projectId,
  parents,
  initialParentId = "",
}: WikiCreatePageFormProps) {
  const router = useRouter();
  const [title, setTitle] = useState("");
  const [parentId, setParentId] = useState(initialParentId);
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!title.trim()) return;

    setSubmitting(true);
    const result = await createWikiPageAction({
      projectId,
      parentId: parentId || null,
      title,
    });
    setSubmitting(false);

    if (!result.ok) {
      toast.error("Не удалось создать страницу", result.formError);
      return;
    }

    toast.success("Страница создана");
    router.push(`/wiki/${result.projectKey}/${result.pageId}/edit`);
    router.refresh();
  };

  return (
    <form
      onSubmit={handleSubmit}
      className="grid gap-2 sm:grid-cols-[minmax(180px,1fr)_minmax(150px,0.7fr)_auto]"
    >
      <Input
        value={title}
        onChange={(event) => setTitle(event.target.value)}
        placeholder="Название страницы"
        maxLength={160}
        aria-label="Название новой Wiki-страницы"
      />
      <select
        value={parentId}
        onChange={(event) => setParentId(event.target.value)}
        className="h-10 rounded-md border border-white/10 bg-[var(--surface-2)] px-3 text-sm text-white"
        aria-label="Родительская страница"
      >
        <option value="">В корне продукта</option>
        {parents.map((page) => (
          <option key={page.id} value={page.id}>
            {"— ".repeat(page.depth)}
            {page.title}
          </option>
        ))}
      </select>
      <Button type="submit" disabled={submitting || !title.trim()}>
        {submitting ? "Создаём…" : "Создать"}
      </Button>
    </form>
  );
}
