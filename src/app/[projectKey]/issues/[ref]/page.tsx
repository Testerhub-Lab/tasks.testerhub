import { renderTaskPage } from "../../../tasks/[ref]/page";
import {
  resolveProjectRouteContext,
  withoutProjectId,
} from "../../projectRoute";

type ProjectIssueDetailPageProps = {
  params: Promise<{ projectKey: string; ref: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export default async function ProjectIssueDetailPage({
  params,
  searchParams,
}: ProjectIssueDetailPageProps) {
  const [{ projectKey, ref }, resolvedSearchParams] = await Promise.all([
    params,
    searchParams,
  ]);
  const projectContext = await resolveProjectRouteContext({
    projectKey,
    searchParams: resolvedSearchParams,
    viewPath: `/issues/${encodeURIComponent(ref)}`,
  });

  return renderTaskPage({
    params: Promise.resolve({ ref }),
    searchParams: Promise.resolve(withoutProjectId(resolvedSearchParams)),
    projectContext,
  });
}
