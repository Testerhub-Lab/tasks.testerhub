"use client";

import dynamic from "next/dynamic";
import { useState } from "react";
import { useRouter } from "next/navigation";
import Button from "@/components/ui/Button";
import Input from "@/components/ui/Input";
import { toast } from "@/components/ui/toast";
import { updateWikiPageAction } from "@/server/knowledge/actions";

const Editor = dynamic(
  () => import("@uiw/react-md-editor/nohighlight").then((module) => module.default),
  {
    ssr: false,
    loading: () => (
      <div className="min-h-80 animate-pulse rounded-md bg-white/[0.025]" />
    ),
  }
);

type WikiMarkdownEditorProps = {
  projectKey: string;
  pageId: string;
  initialTitle: string;
  initialMarkdown: string;
};

export default function WikiMarkdownEditor({
  projectKey,
  pageId,
  initialTitle,
  initialMarkdown,
}: WikiMarkdownEditorProps) {
  const router = useRouter();
  const [title, setTitle] = useState(initialTitle);
  const [markdown, setMarkdown] = useState(initialMarkdown);
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    setSaving(true);
    const result = await updateWikiPageAction({
      pageId,
      title,
      contentMarkdown: markdown,
    });
    setSaving(false);

    if (!result.ok) {
      toast.error("Не удалось сохранить страницу", result.formError);
      return;
    }

    toast.success(`Сохранена версия ${result.version}`);
    router.push(`/wiki/${encodeURIComponent(projectKey)}/${pageId}`);
    router.refresh();
  };

  return (
    <div className="space-y-4">
      <Input
        value={title}
        onChange={(event) => setTitle(event.target.value)}
        maxLength={160}
        className="h-12 text-lg font-semibold"
        aria-label="Название Wiki-страницы"
      />
      <div
        data-color-mode="dark"
        className="overflow-hidden rounded-[var(--radius-md)] border border-white/10 bg-white/[0.02]"
      >
        <Editor
          value={markdown}
          onChange={(value) => setMarkdown(value ?? "")}
          previewOptions={{ skipHtml: true }}
          textareaProps={{
            placeholder: "Начните писать документацию…",
            "aria-label": "Содержимое Wiki-страницы в Markdown",
          }}
          height={520}
          visibleDragbar={false}
        />
      </div>
      <div className="flex justify-end gap-2">
        <Button
          variant="ghost"
          onClick={() =>
            router.push(`/wiki/${encodeURIComponent(projectKey)}/${pageId}`)
          }
          disabled={saving}
        >
          Отмена
        </Button>
        <Button
          onClick={handleSave}
          disabled={saving || !title.trim()}
        >
          {saving ? "Сохраняем…" : "Сохранить"}
        </Button>
      </div>
    </div>
  );
}
