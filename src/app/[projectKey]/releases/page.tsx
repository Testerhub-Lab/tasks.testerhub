import Link from "next/link";
import ReleaseEditor from "@/components/releases/ReleaseEditor";
import { getProjectReleases } from "@/server/queries/releases";
import { buildProjectReleasesPath } from "@/shared/projectKeyRoutes";
import { formatReleaseDate, releaseStatusLabels } from "@/shared/releases";
import { resolveReleaseProject } from "./releaseRoute";

export default async function ProjectReleasesPage({
  params,
}: {
  params: Promise<{ projectKey: string }>;
}) {
  const { projectKey } = await params;
  const project = await resolveReleaseProject(projectKey);
  const releases = await getProjectReleases(project.id);

  return (
    <div className="mx-auto max-w-6xl space-y-4">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-xl font-semibold">Релизы</h1>
        {project.canEdit ? <ReleaseEditor projectId={project.id} /> : null}
      </header>
      {releases.length ? (
        <ul className="divide-y divide-[var(--color-card-border)] border-y border-[var(--color-card-border)]">
          {releases.map((release) => (
            <li key={release.id} className="flex flex-wrap items-center gap-x-4 gap-y-1 px-2 py-3 text-sm">
              <Link className="min-w-0 flex-1 basis-44 break-words font-medium hover:underline"
                href={buildProjectReleasesPath(project.key, release.id)}>
                {release.title}
              </Link>
              <span className="rounded-md bg-[var(--control-bg)] px-2 py-0.5 text-xs">
                {releaseStatusLabels[release.status]}
              </span>
              <span className="text-[var(--muted)]">{formatReleaseDate(release.plannedDate)}</span>
              <span className="text-[var(--muted)]">Задач: {release.issueCount}</span>
            </li>
          ))}
        </ul>
      ) : <p className="text-sm text-[var(--muted)]">В проекте пока нет релизов.</p>}
    </div>
  );
}
