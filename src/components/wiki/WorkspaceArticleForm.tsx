"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import Button from "@/components/ui/Button";
import Input from "@/components/ui/Input";
import Textarea from "@/components/ui/Textarea";
import { saveWorkspaceArticleAction } from "@/server/knowledge/workspaceWikiAction";
import type { WorkspaceArticle } from "@/server/knowledge/workspaceWiki";

export default function WorkspaceArticleForm({ workspaceId, page }: {
  workspaceId: string;
  page: WorkspaceArticle;
}) {
  const router = useRouter();
  const [title, setTitle] = useState(page.title);
  const [markdown, setMarkdown] = useState(page.markdown);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  return (
    <form className="space-y-4" onSubmit={async (event) => {
      event.preventDefault();
      setSaving(true);
      setError("");
      try {
        const result = await saveWorkspaceArticleAction(workspaceId, { ...page, title, markdown });
        if ("id" in result) router.replace(`/wiki/-/${result.id}`);
        else setError(result.error);
      } catch {
        setError("Не удалось сохранить страницу. Попробуйте ещё раз.");
      } finally {
        setSaving(false);
      }
    }}>
      <label className="block space-y-1">
        <span>Название</span>
        <Input value={title} maxLength={160} required onChange={(event) => setTitle(event.target.value)} />
      </label>
      <label className="block space-y-1">
        <span>Текст страницы (Markdown)</span>
        <Textarea value={markdown} rows={14} maxLength={200_000} onChange={(event) => setMarkdown(event.target.value)} />
      </label>
      {error && <p role="alert">{error}</p>}
      <div className="flex items-center gap-4">
        <Button type="submit" disabled={saving || !title.trim()}>{saving ? "Сохраняем…" : "Сохранить"}</Button>
        <Link href={page.version ? `/wiki/-/${page.id}` : "/wiki"}>Отмена</Link>
      </div>
    </form>
  );
}
