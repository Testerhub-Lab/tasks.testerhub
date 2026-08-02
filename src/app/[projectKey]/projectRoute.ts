import { notFound, permanentRedirect, redirect } from "next/navigation";
import { getCurrentUser } from "@/server/auth/session";
import { getCurrentWorkspaceId } from "@/server/auth/workspace";
import { getProjectByKey } from "@/server/queries/projects";
import { projectKeyPathSegment } from "@/shared/projectKeyRoutes";

type SearchParams = Record<string, string | string[] | undefined>;

export function withoutProjectId(searchParams: SearchParams) {
  return Object.fromEntries(
    Object.entries(searchParams).filter(([key]) => key !== "projectId")
  );
}

export function searchParamsToQuery(searchParams: SearchParams) {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(withoutProjectId(searchParams))) {
    if (Array.isArray(value)) {
      for (const item of value) params.append(key, item);
    } else if (value) {
      params.set(key, value);
    }
  }
  const query = params.toString();
  return query ? `?${query}` : "";
}

export async function resolveProjectRouteContext(input: {
  projectKey: string;
  searchParams: SearchParams;
  viewPath: string;
}) {
  const user = await getCurrentUser();
  if (!user) {
    redirect(
      `/signin?redirect=${encodeURIComponent(
        `/${input.projectKey}${input.viewPath}${searchParamsToQuery(
          input.searchParams
        )}`
      )}`
    );
  }

  const workspaceId = await getCurrentWorkspaceId();
  if (!workspaceId) redirect("/signin");

  const project = await getProjectByKey(input.projectKey.toUpperCase(), workspaceId);
  if (!project) notFound();

  const canonicalProjectKey = projectKeyPathSegment(project.key);
  if (input.projectKey !== canonicalProjectKey) {
    permanentRedirect(
      `/${canonicalProjectKey}${input.viewPath}${searchParamsToQuery(
        input.searchParams
      )}`
    );
  }

  return {
    id: project.id,
    key: project.key,
  };
}
