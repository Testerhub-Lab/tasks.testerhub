"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Card from "@/components/ui/Card";
import Button from "@/components/ui/Button";
import { toast } from "@/components/ui/toast";
import {
  addTaskKnowledgeLinkAction,
  removeTaskKnowledgeLinkAction,
} from "@/server/knowledge/actions";

type WikiPageOption = {
  id: string;
  title: string;
};

type KnowledgeLink = {
  id: string;
  documentKey: string;
  title: string;
  url: string | null;
};

type TaskKnowledgePanelProps = {
  taskId: string;
  projectKey: string;
  provider: "DISABLED" | "NATIVE" | "EXTERNAL";
  externalUrl: string | null;
  pages: WikiPageOption[];
  links: KnowledgeLink[];
  canEdit: boolean;
};

export default function TaskKnowledgePanel({
  taskId,
  projectKey,
  provider,
  externalUrl,
  pages,
  links,
  canEdit,
}: TaskKnowledgePanelProps) {
  const router = useRouter();
  const linkedKeys = useMemo(
    () => new Set(links.map((link) => link.documentKey)),
    [links]
  );
  const availablePages = pages.filter((page) => !linkedKeys.has(page.id));
  const [pageId, setPageId] = useState(availablePages[0]?.id ?? "");
  const selectedPageId = availablePages.some((page) => page.id === pageId)
    ? pageId
    : availablePages[0]?.id ?? "";
  const [busyId, setBusyId] = useState<string | null>(null);

  if (provider === "DISABLED" && links.length === 0) return null;

  const handleAdd = async () => {
    if (!selectedPageId) return;
    setBusyId(selectedPageId);
    const result = await addTaskKnowledgeLinkAction({
      taskId,
      pageId: selectedPageId,
    });
    setBusyId(null);

    if (!result.ok) {
      toast.error("Не удалось привязать документ", result.formError);
      return;
    }

    toast.success("Документ привязан к задаче");
    router.refresh();
  };

  const handleRemove = async (linkId: string) => {
    setBusyId(linkId);
    const result = await removeTaskKnowledgeLinkAction({ linkId });
    setBusyId(null);

    if (!result.ok) {
      toast.error("Не удалось убрать документ", result.formError);
      return;
    }

    router.refresh();
  };

  return (
    <Card className="space-y-3 border border-white/4 bg-white/[0.012]">
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-[11px] font-semibold uppercase tracking-[0.16em] text-white/60">
          Документация
        </h2>
        {provider === "NATIVE" ? (
          <Link
            href={`/wiki/${encodeURIComponent(projectKey)}`}
            className="text-xs text-cyan-300 hover:text-cyan-200"
          >
            Открыть Wiki
          </Link>
        ) : externalUrl ? (
          <a
            href={externalUrl}
            target="_blank"
            rel="noreferrer"
            className="text-xs text-cyan-300 hover:text-cyan-200"
          >
            Открыть Wiki
          </a>
        ) : null}
      </div>

      {links.length > 0 ? (
        <ul className="space-y-2">
          {links.map((link) => (
            <li
              key={link.id}
              className="flex items-center justify-between gap-3 rounded-md bg-white/[0.025] px-3 py-2"
            >
              {link.url ? (
                <a
                  href={link.url}
                  target="_blank"
                  rel="noreferrer"
                  className="min-w-0 truncate text-sm text-white/75 hover:text-white"
                >
                  {link.title}
                </a>
              ) : (
                <Link
                  href={`/wiki/${encodeURIComponent(projectKey)}/${
                    link.documentKey
                  }`}
                  className="min-w-0 truncate text-sm text-white/75 hover:text-white"
                >
                  {link.title}
                </Link>
              )}
              {canEdit ? (
                <button
                  type="button"
                  onClick={() => handleRemove(link.id)}
                  disabled={busyId === link.id}
                  className="text-xs text-white/35 hover:text-red-300 disabled:opacity-50"
                  aria-label={`Убрать документ «${link.title}»`}
                >
                  Убрать
                </button>
              ) : null}
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-sm text-white/45">
          К задаче пока не привязаны документы.
        </p>
      )}

      {provider === "NATIVE" && canEdit && availablePages.length > 0 ? (
        <div className="flex gap-2">
          <select
            value={selectedPageId}
            onChange={(event) => setPageId(event.target.value)}
            className="h-9 min-w-0 flex-1 rounded-md border border-white/10 bg-[#11162a] px-2 text-xs text-white"
            aria-label="Wiki-страница для привязки"
          >
            {availablePages.map((page) => (
              <option key={page.id} value={page.id}>
                {page.title}
              </option>
            ))}
          </select>
          <Button
            className="h-9 px-3 text-xs"
            onClick={handleAdd}
            disabled={!selectedPageId || busyId === selectedPageId}
          >
            Привязать
          </Button>
        </div>
      ) : null}
    </Card>
  );
}
