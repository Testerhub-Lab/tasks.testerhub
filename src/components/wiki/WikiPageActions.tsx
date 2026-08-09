"use client";

import Link from "next/link";
import { useState } from "react";
import { useRouter } from "next/navigation";
import Button from "@/components/ui/Button";
import { setWikiPageArchivedAction } from "@/server/knowledge/actions";
import { toast } from "@/components/ui/toast";

type WikiPageActionsProps = {
  projectKey: string;
  pageId: string;
  canEdit: boolean;
};

export default function WikiPageActions({
  projectKey,
  pageId,
  canEdit,
}: WikiPageActionsProps) {
  const router = useRouter();
  const [archiving, setArchiving] = useState(false);

  if (!canEdit) return null;

  const handleArchive = async () => {
    if (!window.confirm("Переместить страницу и все вложенные страницы в архив?")) {
      return;
    }
    setArchiving(true);
    const result = await setWikiPageArchivedAction({ pageId, archived: true });
    setArchiving(false);

    if (!result.ok) {
      toast.error("Не удалось архивировать страницу", result.formError);
      return;
    }

    toast.success("Страница перемещена в архив");
    router.push(`/wiki/${projectKey}`);
    router.refresh();
  };

  return (
    <div className="flex items-center gap-2">
      <Link
        href={`/wiki/${encodeURIComponent(projectKey)}/${pageId}/edit`}
        className="button button--primary ui-tooltip"
        data-tooltip="Редактировать"
        aria-label="Редактировать страницу"
      >
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
          <path d="M12 20h9" />
          <path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z" />
        </svg>
      </Link>
      <Button
        variant="ghost"
        className="ui-tooltip text-red-300"
        data-tooltip="В архив"
        aria-label="Переместить страницу в архив"
        onClick={handleArchive}
        disabled={archiving}
      >
        {archiving ? (
          <span className="block size-4 animate-spin rounded-full border border-current border-t-transparent" />
        ) : (
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
            <path d="M4 7h16" />
            <path d="M9 7V5h6v2" />
            <path d="M7 7l1 12h8l1-12" />
          </svg>
        )}
      </Button>
    </div>
  );
}
