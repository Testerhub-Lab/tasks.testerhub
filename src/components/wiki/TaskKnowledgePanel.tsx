"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
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
  const [showPicker, setShowPicker] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);

  if (provider === "DISABLED" && links.length === 0) return null;

  const handleAdd = async (pageId: string) => {
    setBusyId(pageId);
    const result = await addTaskKnowledgeLinkAction({
      taskId,
      pageId,
    });
    setBusyId(null);

    if (!result.ok) {
      toast.error("Не удалось привязать документ", result.formError);
      return;
    }

    toast.success("Документ привязан к задаче");
    setShowPicker(false);
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
    <section className="space-y-3 border-t border-white/[0.07] pt-5">
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-sm font-medium text-white/75">Linked documents</h2>
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
        <ul className="space-y-1">
          {links.map((link) => (
            <li
              key={link.id}
              className="group flex items-center justify-between gap-3 rounded-md px-2 py-2 transition hover:bg-white/[0.035]"
            >
              <div className="flex min-w-0 items-center gap-2">
                <svg
                  viewBox="0 0 16 16"
                  fill="none"
                  aria-hidden="true"
                  className="h-4 w-4 shrink-0 text-white/35"
                >
                  <path
                    d="M3.5 2.5h6l3 3v8h-9v-11Z"
                    stroke="currentColor"
                    strokeWidth="1.2"
                  />
                  <path d="M9.5 2.5v3h3" stroke="currentColor" strokeWidth="1.2" />
                </svg>
                {link.url ? (
                  <a
                    href={link.url}
                    target="_blank"
                    rel="noreferrer"
                    className="min-w-0 truncate text-sm text-white/70 hover:text-white"
                  >
                    {link.title}
                  </a>
                ) : (
                  <Link
                    href={`/wiki/${encodeURIComponent(projectKey)}/${
                      link.documentKey
                    }`}
                    className="min-w-0 truncate text-sm text-white/70 hover:text-white"
                  >
                    {link.title}
                  </Link>
                )}
              </div>
              {canEdit ? (
                <button
                  type="button"
                  onClick={() => handleRemove(link.id)}
                  disabled={busyId === link.id}
                  className="text-xs text-white/0 transition group-hover:text-white/35 hover:!text-red-300 disabled:opacity-50"
                  aria-label={`Убрать документ «${link.title}»`}
                >
                  Убрать
                </button>
              ) : null}
            </li>
          ))}
        </ul>
      ) : (
        <p className="px-2 text-sm text-white/35">
          К задаче пока не привязаны документы.
        </p>
      )}

      {provider === "NATIVE" && canEdit && availablePages.length > 0 ? (
        showPicker ? (
          <div className="max-h-48 overflow-y-auto rounded-lg border border-white/[0.09] bg-[#0b1020] p-1 shadow-[0_16px_40px_rgba(0,0,0,0.3)]">
            {availablePages.map((page) => (
              <button
                key={page.id}
                type="button"
                onClick={() => void handleAdd(page.id)}
                disabled={busyId !== null}
                className="flex w-full items-center gap-2 rounded-md px-2.5 py-2 text-left text-xs text-white/70 transition hover:bg-white/[0.05] hover:text-white disabled:opacity-50"
              >
                <span className="text-white/30">↗</span>
                <span className="min-w-0 truncate">{page.title}</span>
              </button>
            ))}
          </div>
        ) : (
          <button
            type="button"
            onClick={() => setShowPicker(true)}
            className="rounded-md px-2 py-1.5 text-xs text-white/45 transition hover:bg-white/[0.04] hover:text-white/70"
          >
            + Link document
          </button>
        )
      ) : null}
    </section>
  );
}
