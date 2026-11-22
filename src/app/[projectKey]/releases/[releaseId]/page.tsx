import Link from "next/link";
import { notFound } from "next/navigation";
import ReleaseEditor from "@/components/releases/ReleaseEditor";
import ReleaseIssues from "@/components/releases/ReleaseIssues";
import { getAvailableReleaseIssues, getProjectRelease, getReleaseIssues } from "@/server/queries/releases";
import { buildProjectReleasesPath } from "@/shared/projectKeyRoutes";
import { formatReleaseDate, releaseStatusLabels } from "@/shared/releases";
import { resolveReleaseProject } from "../releaseRoute";

export default async function ProjectReleasePage({
  params,
}: {
  params: Promise<{ projectKey: string; releaseId: string }>;
}) {
  const { projectKey, releaseId } = await params;
  const project = await resolveReleaseProject(projectKey, releaseId);
  const release = await getProjectRelease(project.id, releaseId);
  if (!release) notFound();
  const [issues, candidates] = await Promise.all([
    getReleaseIssues(project.id, releaseId),
    project.canEdit && release.status !== "released" ? getAvailableReleaseIssues(project.id) : null,
  ]);

  return (
    <div className="mx-auto max-w-6xl space-y-5">
      <header className="space-y-2">
        <Link href={buildProjectReleasesPath(project.key)} className="text-sm text-[var(--muted)] hover:underline">
          ← Все релизы
        </Link>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h1 className="min-w-0 break-words text-xl font-semibold">{release.title}</h1>
          {project.canEdit ? <ReleaseEditor projectId={project.id} release={release} /> : null}
        </div>
        <div className="flex flex-wrap items-center gap-3 text-sm">
          <span className="rounded-md bg-[var(--control-bg)] px-2 py-0.5 text-xs">
            {releaseStatusLabels[release.status]}
          </span>
          <span className="text-[var(--muted)]">{formatReleaseDate(release.plannedDate)}</span>
        </div>
        {release.goal ? <p className="whitespace-pre-wrap break-words text-sm">{release.goal}</p> : null}
      </header>
      <ReleaseIssues projectId={project.id} projectKey={project.key} releaseId={releaseId} issues={issues} candidates={candidates} />
    </div>
  );
}
