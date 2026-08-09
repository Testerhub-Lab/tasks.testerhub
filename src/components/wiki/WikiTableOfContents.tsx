"use client";

import { useMemo, useState } from "react";
import { usePathname } from "next/navigation";
import { extractWikiHeadings } from "@/server/knowledge/headings";

type WikiTableOfContentsProps = {
  markdown: string;
};

export default function WikiTableOfContents({
  markdown,
}: WikiTableOfContentsProps) {
  const pathname = usePathname();
  const projectKey = pathname.startsWith("/wiki/")
    ? pathname.split("/")[2]
    : "global";
  const storageKey = `pulsar:wiki-toc-open:${projectKey}`;
  const headings = useMemo(() => extractWikiHeadings(markdown), [markdown]);
  const [open, setOpen] = useState(() => {
    if (typeof window === "undefined") return true;
    return window.localStorage.getItem(storageKey) !== "false";
  });

  if (headings.length < 2) return null;

  return (
    <details
      className="mb-5 rounded-md border border-white/6 bg-white/[0.02] p-3"
      open={open}
      onToggle={(event) => {
        const nextOpen = event.currentTarget.open;
        setOpen(nextOpen);
        window.localStorage.setItem(storageKey, String(nextOpen));
      }}
    >
      <summary className="cursor-pointer text-xs font-medium text-white/55">
        Оглавление · {headings.length}
      </summary>
      <nav className="mt-3 space-y-1" aria-label="Оглавление документа">
        {headings.map((heading) => (
          <a
            key={heading.id}
            href={`#${heading.id}`}
            className="block text-sm text-cyan-300/75 hover:text-cyan-200"
            style={{ paddingLeft: `${Math.max(0, heading.level - 1) * 0.75}rem` }}
          >
            {heading.text}
          </a>
        ))}
      </nav>
    </details>
  );
}
