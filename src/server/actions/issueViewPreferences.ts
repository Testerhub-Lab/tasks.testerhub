"use server";

import { z } from "zod";
import { getCurrentUser } from "@/server/auth/session";
import { getCurrentWorkspaceId } from "@/server/auth/workspace";
import { getProjectAccess, getWorkspaceRole } from "@/server/auth/access";
import { usesZeroUiStore } from "@/server/ui/zero-legacy";
import { getZeroPool } from "@/zero/db";

const saveIssueViewPreferenceSchema = z.object({
  scope: z.enum(["all", "project", "my"]),
  projectId: z.string().uuid().nullable().optional(),
  layout: z.enum(["board", "list"]),
});

export async function saveIssueViewPreferenceAction(
  input: z.input<typeof saveIssueViewPreferenceSchema>
) {
  const parsed = saveIssueViewPreferenceSchema.safeParse(input);
  if (!parsed.success) return { ok: false as const };

  const user = await getCurrentUser();
  if (!user) return { ok: false as const };

  const workspaceId = await getCurrentWorkspaceId();
  if (!workspaceId) return { ok: false as const };

  if (!usesZeroUiStore()) return { ok: true as const };

  const { scope, layout } = parsed.data;
  const projectId = parsed.data.projectId ?? null;
  if (scope === "all" && projectId) return { ok: false as const };
  if (scope === "project" && !projectId) return { ok: false as const };

  const workspaceRole = await getWorkspaceRole(user, workspaceId);
  if (!workspaceRole) return { ok: false as const };

  if (projectId) {
    const access = await getProjectAccess(user, projectId, { workspaceId });
    if (!access) return { ok: false as const };
  }

  const pool = getZeroPool();
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const updated = await client.query<{ id: string }>(
      `UPDATE issue_view_preferences
       SET layout = $5, updated_at = now()
       WHERE
         workspace_id = $1
         AND user_id = $2
         AND scope = $3
         AND project_id IS NOT DISTINCT FROM $4::uuid
       RETURNING id`,
      [workspaceId, user.id, scope, projectId, layout]
    );

    if (updated.rowCount === 0) {
      await client.query(
        `INSERT INTO issue_view_preferences (
           id, workspace_id, user_id, scope, project_id, layout
         ) VALUES (
           gen_random_uuid(), $1, $2, $3, $4::uuid, $5
         )`,
        [workspaceId, user.id, scope, projectId, layout]
      );
    }

    await client.query("COMMIT");
    return { ok: true as const };
  } catch (error) {
    await client.query("ROLLBACK").catch(() => null);
    throw error;
  } finally {
    client.release();
  }
}
