"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { restoreWikiRevisionAction } from "@/server/knowledge/actions";
import { toast } from "@/components/ui/toast";

type WikiRevisionActionsProps = {
  pageId: string;
  revisionId: string;
  version: number;
};

export default function WikiRevisionActions({
  pageId,
  revisionId,
  version,
}: WikiRevisionActionsProps) {
  const router = useRouter();
  const [restoring, setRestoring] = useState(false);

  const handleRestore = async () => {
    if (!window.confirm(`Восстановить версию ${version} как новую версию?`)) {
      return;
    }
    setRestoring(true);
    const result = await restoreWikiRevisionAction({ pageId, revisionId });
    setRestoring(false);

    if (!result.ok) {
      toast.error("Не удалось восстановить версию", result.formError);
      return;
    }

    toast.success(`Версия ${version} восстановлена`);
    router.refresh();
  };

  return (
    <button
      type="button"
      onClick={handleRestore}
      disabled={restoring}
      className="text-xs text-cyan-300 hover:text-cyan-200 disabled:opacity-50"
    >
      {restoring ? "Восстанавливаем…" : "Восстановить"}
    </button>
  );
}
