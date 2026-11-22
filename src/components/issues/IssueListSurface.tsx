"use client";

import { useRouter, useSearchParams } from "next/navigation";
import type { ReactNode } from "react";
import Card from "@/components/ui/Card";
import MenuSelect from "@/components/ui/MenuSelect";
import type { IssueSort } from "@/shared/issueFilterConfig";

const sorts = [
  { value: "", label: "Сначала новые" },
  { value: "priority-desc", label: "Высокий приоритет первым" },
  { value: "priority-asc", label: "Низкий приоритет первым" },
] satisfies { value: "" | IssueSort; label: string }[];

export default function IssueListSurface({ children, basePath, sort }: {
  children: ReactNode;
  basePath: string;
  sort?: IssueSort;
}) {
  const router = useRouter();
  const searchParams = useSearchParams();
  return (
    <Card variant="surface" padding="none" className="rounded-2xl">
      <div className="flex items-center justify-end gap-2 border-b border-[var(--sep)] px-3 py-1.5 text-xs">
        <span className="text-[var(--muted)]">Сортировка</span>
        <MenuSelect ariaLabel="Сортировка задач" value={sort ?? ""} options={sorts} inline
          onChange={(value) => {
            const params = new URLSearchParams(searchParams);
            params.delete("page");
            if (value) params.set("sort", value);
            else params.delete("sort");
            router.replace(params.size ? `${basePath}?${params}` : basePath, { scroll: false });
          }} />
      </div>
      {children}
    </Card>
  );
}
