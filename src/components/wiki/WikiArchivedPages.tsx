"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { setWikiPageArchivedAction } from "@/server/knowledge/actions";
import { toast } from "@/components/ui/toast";

type ArchivedPage = {
  id: string;
  title: string;
};

type WikiArchivedPagesProps = {
  pages: ArchivedPage[];
};

export default function WikiArchivedPages({
  pages,
}: WikiArchivedPagesProps) {
  const router = useRouter();
  const [restoringId, setRestoringId] = useState<string | null>(null);

  const handleRestore = async (page: ArchivedPage) => {
    setRestoringId(page.id);
    const result = await setWikiPageArchivedAction({
      pageId: page.id,
      archived: false,
    });
    setRestoringId(null);

    if (!result.ok) {
      toast.error("Не удалось восстановить страницу", result.formError);
      return;
    }

    toast.success(`Страница «${page.title}» восстановлена`);
    router.refresh();
  };

  if (pages.length === 0) return null;

  return (
    <details className="surface rounded-[var(--radius-md)] p-4">
      <summary className="cursor-pointer text-sm text-white/55">
        Архив страниц ({pages.length})
      </summary>
      <ul className="mt-3 divide-y divide-white/5">
        {pages.map((page) => (
          <li
            key={page.id}
            className="flex items-center justify-between gap-3 py-2"
          >
            <span className="truncate text-sm text-white/65">{page.title}</span>
            <button
              type="button"
              onClick={() => handleRestore(page)}
              disabled={restoringId === page.id}
              className="text-xs text-cyan-300 hover:text-cyan-200 disabled:opacity-50"
            >
              {restoringId === page.id ? "Восстанавливаем…" : "Восстановить"}
            </button>
          </li>
        ))}
      </ul>
    </details>
  );
}
