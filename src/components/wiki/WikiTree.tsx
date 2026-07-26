import Link from "next/link";

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
}: WikiTreeProps & { parentId: string | null; depth: number }) {
  const children = pages.filter((page) => page.parentId === parentId);
  if (children.length === 0) return null;

  return (
    <ul className={depth === 0 ? "space-y-1" : "ml-4 mt-1 space-y-1"}>
      {children.map((page) => (
        <li key={page.id}>
          <Link
            href={`/wiki/${encodeURIComponent(projectKey)}/${page.id}`}
            className={`block rounded-md px-2 py-1.5 text-sm transition-colors ${
              activePageId === page.id
                ? "bg-cyan-400/10 text-cyan-200"
                : "text-white/70 hover:bg-white/5 hover:text-white"
            }`}
          >
            {page.title}
          </Link>
          <WikiTreeBranch
            projectKey={projectKey}
            pages={pages}
            parentId={page.id}
            activePageId={activePageId}
            depth={depth + 1}
          />
        </li>
      ))}
    </ul>
  );
}

export default function WikiTree(props: WikiTreeProps) {
  return <WikiTreeBranch {...props} parentId={null} depth={0} />;
}
