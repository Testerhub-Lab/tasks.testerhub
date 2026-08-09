"use client";

import Link from "next/link";
import { useMemo, useState } from "react";

export type WikiTreePage = {
  id: string;
  parentId: string | null;
  title: string;
  archivedAt: Date | null;
};

type WikiTreeProps = {
  projectKey: string;
  pages: WikiTreePage[];
  activePageId?: string;
};

function WikiTreeBranch({
  projectKey,
  pages,
  parentId,
  activePageId,
  depth,
  byParent,
  expanded,
  onToggle,
}: WikiTreeProps & {
  parentId: string | null;
  depth: number;
  byParent: Map<string | null, WikiTreePage[]>;
  expanded: Set<string>;
  onToggle: (pageId: string) => void;
}) {
  const children = byParent.get(parentId) ?? [];
  if (children.length === 0) return null;

  return (
    <ul className={depth === 0 ? "space-y-1" : "ml-4 mt-1 space-y-1"}>
      {children.map((page) => (
        <li key={page.id}>
          <div className="flex items-center gap-1">
            {(byParent.get(page.id)?.length ?? 0) > 0 ? (
              <button
                type="button"
                onClick={() => onToggle(page.id)}
                className="grid size-6 shrink-0 place-items-center rounded text-xs text-white/40 hover:bg-white/5 hover:text-white/70"
                aria-label={expanded.has(page.id) ? "Свернуть ветку" : "Развернуть ветку"}
                aria-expanded={expanded.has(page.id)}
              >
                {expanded.has(page.id) ? "▾" : "▸"}
              </button>
            ) : (
              <span className="block size-6 shrink-0" />
            )}
            <Link
              href={`/wiki/${encodeURIComponent(projectKey)}/${page.id}`}
              className={`min-w-0 flex-1 truncate rounded-md px-2 py-1.5 text-sm transition-colors ${
                activePageId === page.id
                  ? "bg-cyan-400/10 text-cyan-200"
                  : "text-white/70 hover:bg-white/5 hover:text-white"
              }`}
              title={page.title}
            >
              {page.title}
            </Link>
          </div>
          {expanded.has(page.id) ? (
            <WikiTreeBranch
              projectKey={projectKey}
              pages={pages}
              parentId={page.id}
              activePageId={activePageId}
              depth={depth + 1}
              byParent={byParent}
              expanded={expanded}
              onToggle={onToggle}
            />
          ) : null}
        </li>
      ))}
    </ul>
  );
}

export default function WikiTree(props: WikiTreeProps) {
  const byParent = useMemo(() => {
    const result = new Map<string | null, WikiTreePage[]>();
    for (const page of props.pages) {
      const siblings = result.get(page.parentId) ?? [];
      siblings.push(page);
      result.set(page.parentId, siblings);
    }
    return result;
  }, [props.pages]);
  const [expanded, setExpanded] = useState(
    () => new Set(props.pages.filter((page) => byParent.has(page.id)).map((page) => page.id))
  );

  const handleToggle = (pageId: string) => {
    setExpanded((current) => {
      const next = new Set(current);
      if (next.has(pageId)) next.delete(pageId);
      else next.add(pageId);
      return next;
    });
  };

  return (
    <WikiTreeBranch
      {...props}
      parentId={null}
      depth={0}
      byParent={byParent}
      expanded={expanded}
      onToggle={handleToggle}
    />
  );
}
