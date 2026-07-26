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
        className="button button--primary"
      >
        Редактировать
      </Link>
      <Button
        variant="ghost"
        className="text-red-300"
        onClick={handleArchive}
        disabled={archiving}
      >
        {archiving ? "Архивируем…" : "В архив"}
      </Button>
    </div>
  );
}
