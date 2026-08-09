import { extractWikiHeadings } from "@/server/knowledge/headings";

type WikiTableOfContentsProps = {
  markdown: string;
};

export default function WikiTableOfContents({
  markdown,
}: WikiTableOfContentsProps) {
  const headings = extractWikiHeadings(markdown);
  if (headings.length < 2) return null;

  return (
    <details className="mb-5 rounded-md border border-white/6 bg-white/[0.02] p-3">
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
