"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import MenuSelect from "@/components/ui/MenuSelect";
import { isAuthRequiredError, showAuthRequiredToast } from "@/lib/authRequired";
import { setIssueReleaseAction } from "@/server/actions/releases";
import { buildProjectReleasesPath } from "@/shared/projectKeyRoutes";
import { releaseStatusLabels, type ReleaseOption } from "@/shared/releases";

export default function IssueReleaseField({
  issueId,
  projectId,
  projectKey,
  release,
  options,
}: {
  issueId: string;
  projectId: string;
  projectKey: string | null;
  release: ReleaseOption | null;
  options: ReleaseOption[];
}) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const changeRelease = (releaseId: string | null) => {
    setError(null);
    startTransition(async () => {
      const result = await setIssueReleaseAction({
        issueId,
        projectId,
        previousReleaseId: release?.id ?? null,
        releaseId,
      });
      if (!result.ok) {
        if (isAuthRequiredError(result)) showAuthRequiredToast();
        setError(result.formError);
      }
      router.refresh();
    });
  };
  const href = release && projectKey ? buildProjectReleasesPath(projectKey, release.id) : null;

  return (
    <div className="order-5 space-y-1 rounded-lg px-2 py-2 hover:bg-white/5">
      <div className="flex items-center justify-between gap-3">
        <span className="flex shrink-0 items-center gap-2 text-white/60">
          <svg aria-hidden="true" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
            <path d="M12 3 4 7.5v9l8 4.5 8-4.5v-9L12 3ZM4 7.5l8 4.5 8-4.5M12 12v9M8 5.25l8 4.5" />
          </svg>
          Релиз
        </span>
        {options.length ? (
          <div className="flex min-w-0 items-center gap-1">
            <MenuSelect
              ariaLabel="Релиз"
              inline
              displayValue={release?.title ?? "Без релиза"}
              disabled={pending}
              value={release?.id ?? ""}
              onChange={(value) => changeRelease(value || null)}
              options={[
                { value: "", label: "Без релиза" },
                ...options.map(({ id: value, title, status }) => ({ value, label: `${title} · ${releaseStatusLabels[status]}` })),
              ]}
            />
            {href ? (
              <Link aria-label="Открыть релиз" title={release?.title} href={href} className="shrink-0 rounded px-1 py-1 text-white/70 hover:bg-white/10">
                <span aria-hidden="true">↗</span>
              </Link>
            ) : null}
          </div>
        ) : release && href ? (
          <Link href={href} title={release.title} className="min-w-0 truncate text-sm text-white/80 hover:underline">
            {release.title}
          </Link>
        ) : <span title={release?.title} className="min-w-0 truncate text-sm text-white/45">
          {release?.title ?? "Без релиза"}
        </span>}
      </div>
      {error ? <p role="alert" className="text-xs text-rose-300">{error}</p> : null}
    </div>
  );
}
