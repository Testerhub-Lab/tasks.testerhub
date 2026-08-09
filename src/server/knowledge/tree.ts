export type WikiTreeNode = {
  id: string;
  parentId: string | null;
  title: string;
};

export type WikiTreeOption = WikiTreeNode & {
  depth: number;
};

export function flattenWikiTree(pages: WikiTreeNode[]): WikiTreeOption[] {
  const byParent = new Map<string | null, WikiTreeNode[]>();
  for (const page of pages) {
    const siblings = byParent.get(page.parentId) ?? [];
    siblings.push(page);
    byParent.set(page.parentId, siblings);
  }

  const result: WikiTreeOption[] = [];
  const visited = new Set<string>();
  const append = (parentId: string | null, depth: number) => {
    for (const page of byParent.get(parentId) ?? []) {
      if (visited.has(page.id)) continue;
      visited.add(page.id);
      result.push({ ...page, depth });
      append(page.id, depth + 1);
    }
  };

  append(null, 0);
  for (const page of pages) {
    if (!visited.has(page.id)) {
      visited.add(page.id);
      result.push({ ...page, depth: 0 });
      append(page.id, 1);
    }
  }
  return result;
}

export function getWikiDescendantIds(pages: WikiTreeNode[], pageId: string) {
  const descendants = new Set<string>();
  let foundMore = true;
  while (foundMore) {
    foundMore = false;
    for (const page of pages) {
      if (
        page.parentId &&
        (page.parentId === pageId || descendants.has(page.parentId)) &&
        !descendants.has(page.id)
      ) {
        descendants.add(page.id);
        foundMore = true;
      }
    }
  }
  return descendants;
}

export function getWikiParentOptions(
  pages: WikiTreeNode[],
  excludedPageId?: string
) {
  const excluded = excludedPageId
    ? getWikiDescendantIds(pages, excludedPageId)
    : new Set<string>();
  if (excludedPageId) excluded.add(excludedPageId);
  return flattenWikiTree(pages).filter((page) => !excluded.has(page.id));
}

export function getWikiBreadcrumbs(pages: WikiTreeNode[], pageId: string) {
  const byId = new Map(pages.map((page) => [page.id, page]));
  const result: WikiTreeNode[] = [];
  const visited = new Set<string>();
  let current = byId.get(pageId);

  while (current && !visited.has(current.id)) {
    visited.add(current.id);
    result.unshift(current);
    current = current.parentId ? byId.get(current.parentId) : undefined;
  }
  return result;
}
