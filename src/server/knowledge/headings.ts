export type WikiHeading = {
  level: number;
  text: string;
  id: string;
};

export function wikiHeadingSlug(value: string) {
  return (
    value
      .trim()
      .toLocaleLowerCase()
      .replace(/[^\p{L}\p{N}\s-]/gu, "")
      .replace(/\s+/g, "-")
      .replace(/-+/g, "-") || "section"
  );
}

export function uniqueWikiHeadingId(
  text: string,
  counts: Map<string, number>
) {
  const base = wikiHeadingSlug(text);
  const count = counts.get(base) ?? 0;
  counts.set(base, count + 1);
  return count === 0 ? base : `${base}-${count + 1}`;
}

export function extractWikiHeadings(markdown: string) {
  const headings: WikiHeading[] = [];
  const counts = new Map<string, number>();
  let fenced = false;
  for (const line of markdown.split(/\r?\n/)) {
    if (/^\s*```/.test(line)) {
      fenced = !fenced;
      continue;
    }
    if (fenced) continue;
    const match = /^(#{1,4})\s+(.+?)\s*#*\s*$/.exec(line);
    if (!match) continue;
    const text = match[2]!.replace(/[*_`~[\]]/g, "").trim();
    headings.push({
      level: match[1]!.length,
      text,
      id: uniqueWikiHeadingId(text, counts),
    });
  }
  return headings;
}
