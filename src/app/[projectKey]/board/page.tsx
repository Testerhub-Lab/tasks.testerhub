import { renderBoardPage } from "../../board/page";
import {
  resolveProjectRouteContext,
  withoutProjectId,
} from "../projectRoute";

type ProjectBoardPageProps = {
  params: Promise<{ projectKey: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export default async function ProjectBoardPage({
  params,
  searchParams,
}: ProjectBoardPageProps) {
  const [{ projectKey }, resolvedSearchParams] = await Promise.all([
    params,
    searchParams,
  ]);
  const projectContext = await resolveProjectRouteContext({
    projectKey,
    searchParams: resolvedSearchParams,
    viewPath: "/board",
  });

  return renderBoardPage({
    searchParams: Promise.resolve(withoutProjectId(resolvedSearchParams)),
    basePath: `/${projectKey}/board`,
    projectContext,
  });
}
