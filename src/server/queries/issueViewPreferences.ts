import { getZeroPool } from "@/zero/db";
import { usesZeroUiStore } from "@/server/ui/zero-legacy";
import type {
  IssueViewLayout,
  IssueViewPreference,
  IssueViewScope,
} from "@/shared/issueViews";

type IssueViewPreferenceRow = {
  scope: IssueViewScope;
  project_id: string | null;
  layout: IssueViewLayout;
};

export async function getIssueViewPreferences(input: {
  userId: string;
  workspaceId: string;
}): Promise<IssueViewPreference[]> {
  if (!usesZeroUiStore()) return [];

  const result = await getZeroPool().query<IssueViewPreferenceRow>(
    `SELECT preference.scope, preference.project_id, preference.layout
     FROM issue_view_preferences AS preference
     JOIN workspace_members AS membership
       ON membership.workspace_id = preference.workspace_id
      AND membership.user_id = preference.user_id
     WHERE
       preference.user_id = $1
       AND preference.workspace_id = $2
     ORDER BY preference.updated_at DESC`,
    [input.userId, input.workspaceId]
  );

  return result.rows.map((row) => ({
    scope: row.scope,
    projectId: row.project_id,
    layout: row.layout,
  }));
}
