import { renderBacklogPage } from "../../backlog/page";
import {
  resolveProjectRouteContext,
  withoutProjectId,
} from "../projectRoute";

type ProjectBacklogPageProps = {
  params: Promise<{ projectKey: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export default async function ProjectBacklogPage({
  params,
  searchParams,
}: ProjectBacklogPageProps) {
  const [{ projectKey }, resolvedSearchParams] = await Promise.all([
    params,
    searchParams,
  ]);
  const projectContext = await resolveProjectRouteContext({
    projectKey,
    searchParams: resolvedSearchParams,
    viewPath: "/backlog",
  });

  return renderBacklogPage({
    searchParams: Promise.resolve(withoutProjectId(resolvedSearchParams)),
    basePath: `/${projectKey}/backlog`,
    projectContext,
  });
}
