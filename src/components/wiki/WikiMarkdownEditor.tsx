"use client";

import dynamic from "next/dynamic";
import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Button from "@/components/ui/Button";
import Input from "@/components/ui/Input";
import { toast } from "@/components/ui/toast";
import { updateWikiPageAction } from "@/server/knowledge/actions";
import { createWikiMarkdownComponents } from "./wikiMarkdownComponents";

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
  initialParentId: string | null;
  initialVersion: number;
  parents: Array<{ id: string; title: string; depth: number }>;
};

type LocalWikiDraft = {
  title: string;
  markdown: string;
  parentId: string;
  baseVersion: number;
};

export default function WikiMarkdownEditor({
  projectKey,
  pageId,
  initialTitle,
  initialMarkdown,
  initialParentId,
  initialVersion,
  parents,
}: WikiMarkdownEditorProps) {
  const router = useRouter();
  const [title, setTitle] = useState(initialTitle);
  const [markdown, setMarkdown] = useState(initialMarkdown);
  const [parentId, setParentId] = useState(initialParentId ?? "");
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [draftChecked, setDraftChecked] = useState(false);
  const [recoverableDraft, setRecoverableDraft] = useState<LocalWikiDraft | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const draftKey = `pulsar:wiki-draft:${pageId}`;
  const markdownComponents = useMemo(() => createWikiMarkdownComponents(), []);

  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(draftKey);
      if (raw) {
        const stored = JSON.parse(raw) as LocalWikiDraft;
        if (
          stored.baseVersion === initialVersion &&
          (stored.title !== initialTitle ||
            stored.markdown !== initialMarkdown ||
            stored.parentId !== (initialParentId ?? ""))
        ) {
          setRecoverableDraft(stored);
        }
      }
    } catch {
      window.localStorage.removeItem(draftKey);
    }
    setDraftChecked(true);
  }, [draftKey, initialMarkdown, initialParentId, initialTitle, initialVersion]);

  useEffect(() => {
    if (!draftChecked || recoverableDraft) return;
    const timeout = window.setTimeout(() => {
      const draft: LocalWikiDraft = {
        title,
        markdown,
        parentId,
        baseVersion: initialVersion,
      };
      window.localStorage.setItem(draftKey, JSON.stringify(draft));
    }, 500);
    return () => window.clearTimeout(timeout);
  }, [draftChecked, draftKey, initialVersion, markdown, parentId, recoverableDraft, title]);

  const handleSave = async () => {
    setSaving(true);
    const result = await updateWikiPageAction({
      pageId,
      title,
      contentMarkdown: markdown,
      parentId: parentId || null,
      expectedVersion: initialVersion,
    });
    setSaving(false);

    if (!result.ok) {
      toast.error("Не удалось сохранить страницу", result.formError);
      return;
    }

    window.localStorage.removeItem(draftKey);
    toast.success(`Сохранена версия ${result.version}`);
    router.push(`/wiki/${encodeURIComponent(projectKey)}/${pageId}`);
    router.refresh();
  };

  const uploadFile = async (file: File) => {
    setUploading(true);
    try {
      const prepareResponse = await fetch(
        `/api/ui/wiki/pages/${pageId}/attachments`,
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            fileName: file.name,
            contentType: file.type,
            sizeBytes: file.size,
          }),
        }
      );
      const prepared = (await prepareResponse.json()) as {
        attachmentId?: string;
        uploadUrl?: string;
        headers?: Record<string, string>;
        error?: string;
      };
      if (!prepareResponse.ok || !prepared.attachmentId || !prepared.uploadUrl) {
        throw new Error(prepared.error ?? "Не удалось подготовить загрузку");
      }
      const uploadResponse = await fetch(prepared.uploadUrl, {
        method: "PUT",
        headers: prepared.headers,
        body: file,
      });
      if (!uploadResponse.ok) throw new Error("Не удалось загрузить файл");

      const confirmResponse = await fetch(
        `/api/ui/wiki/pages/${pageId}/attachments/${prepared.attachmentId}/confirm`,
        { method: "POST" }
      );
      if (!confirmResponse.ok) throw new Error("Не удалось подтвердить загрузку");
      const downloadPath =
        `/api/ui/wiki/pages/${pageId}/attachments/` +
        `${prepared.attachmentId}/download`;
      const label = file.name.replace(/[\[\]]/g, "");
      const markdownLink = file.type.startsWith("image/")
        ? `![${label}](${downloadPath})`
        : `[${label}](${downloadPath})`;
      setMarkdown((current) =>
        `${current.trimEnd()}${current.trim() ? "\n\n" : ""}${markdownLink}\n`
      );
      toast.success("Файл добавлен в документ");
    } catch (error) {
      toast.error(
        "Не удалось загрузить файл",
        error instanceof Error ? error.message : undefined
      );
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
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
      <label className="block space-y-1 text-sm text-white/60">
        <span>Родительская страница</span>
        <select
          value={parentId}
          onChange={(event) => setParentId(event.target.value)}
          className="input w-full"
        >
          <option value="">В корне продукта</option>
          {parents.map((page) => (
            <option key={page.id} value={page.id}>
              {"— ".repeat(page.depth)}
              {page.title}
            </option>
          ))}
        </select>
      </label>
      {recoverableDraft ? (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-md border border-amber-300/15 bg-amber-300/5 px-3 py-2 text-sm text-amber-100/75">
          <span>Найден локальный несохранённый черновик.</span>
          <div className="flex gap-2">
            <Button
              variant="ghost"
              onClick={() => {
                window.localStorage.removeItem(draftKey);
                setRecoverableDraft(null);
              }}
            >
              Удалить
            </Button>
            <Button
              onClick={() => {
                setTitle(recoverableDraft.title);
                setMarkdown(recoverableDraft.markdown);
                setParentId(recoverableDraft.parentId);
                setRecoverableDraft(null);
              }}
            >
              Восстановить
            </Button>
          </div>
        </div>
      ) : null}
      <div
        data-color-mode="dark"
        className="pulsar-markdown-editor overflow-hidden rounded-[var(--radius-md)] border border-white/10 bg-white/[0.02]"
        onDragOver={(event) => {
          if (event.dataTransfer.types.includes("Files")) event.preventDefault();
        }}
        onDrop={(event) => {
          const file = event.dataTransfer.files[0];
          if (!file) return;
          event.preventDefault();
          void uploadFile(file);
        }}
        onPaste={(event) => {
          const file = Array.from(event.clipboardData.files).find((candidate) =>
            candidate.type.startsWith("image/")
          );
          if (!file) return;
          event.preventDefault();
          void uploadFile(file);
        }}
      >
        <Editor
          value={markdown}
          onChange={(value) => setMarkdown(value ?? "")}
          previewOptions={{
            skipHtml: true,
            components: markdownComponents,
          }}
          textareaProps={{
            placeholder: "Начните писать документацию…",
            "aria-label": "Содержимое Wiki-страницы в Markdown",
          }}
          height={520}
          visibleDragbar={false}
        />
      </div>
      <div className="flex justify-end gap-2">
        <input
          ref={fileInputRef}
          type="file"
          className="hidden"
          onChange={(event) => {
            const file = event.target.files?.[0];
            if (file) void uploadFile(file);
          }}
        />
        <Button
          variant="ghost"
          onClick={() => fileInputRef.current?.click()}
          disabled={uploading}
        >
          {uploading ? "Загружаем…" : "Добавить файл"}
        </Button>
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
