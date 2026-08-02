import { renderIssuesPage } from "../../issues/page";
import {
  resolveProjectRouteContext,
  withoutProjectId,
} from "../projectRoute";

type ProjectIssuesPageProps = {
  params: Promise<{ projectKey: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export default async function ProjectIssuesPage({
  params,
  searchParams,
}: ProjectIssuesPageProps) {
  const [{ projectKey }, resolvedSearchParams] = await Promise.all([
    params,
    searchParams,
  ]);
  const projectContext = await resolveProjectRouteContext({
    projectKey,
    searchParams: resolvedSearchParams,
    viewPath: "/issues",
  });

  return renderIssuesPage({
    searchParams: Promise.resolve(withoutProjectId(resolvedSearchParams)),
    basePath: `/${projectKey}/issues`,
    projectContext,
  });
}
