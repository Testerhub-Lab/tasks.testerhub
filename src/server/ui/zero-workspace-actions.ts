import { getZeroDatabase, getZeroPool } from "@/zero/db";
import { zeroMutators } from "@/zero/mutators";
import { createApiProject } from "@/server/api/zero-domain";

function actor(user: { id: string; name: string | null }) {
  return { id: user.id, email: null, name: user.name };
}

export async function updateZeroWorkspace(input: {
  actorID: string;
  workspaceID: string;
  name: string;
}) {
  const result = await getZeroPool().query(
    `UPDATE workspaces AS workspace
     SET name = $3, updated_at = now()
     FROM workspace_members AS membership
     WHERE
       workspace.id = $1
       AND membership.workspace_id = workspace.id
       AND membership.user_id = $2
       AND membership.role IN ('OWNER', 'ADMIN')
     RETURNING workspace.id`,
    [input.workspaceID, input.actorID, input.name]
  );
  if (!result.rowCount) throw new Error("Workspace administration denied");
}

export async function createZeroWorkspaceProject(input: {
  user: { id: string; name: string | null };
  workspaceID: string;
  key: string;
  name: string;
}) {
  return createApiProject(actor(input.user), {
    workspaceId: input.workspaceID,
    key: input.key,
    name: input.name,
    description: null,
  });
}

export async function setZeroProjectArchived(input: {
  actorID: string;
  workspaceID: string;
  projectID: string;
  archived: boolean;
}) {
  const result = await getZeroPool().query(
    `UPDATE projects AS project
     SET archived_at = $4, updated_at = now()
     FROM workspace_members AS membership
     WHERE
       project.id = $1
       AND project.workspace_id = $2
       AND membership.workspace_id = project.workspace_id
       AND membership.user_id = $3
       AND membership.role IN ('OWNER', 'ADMIN')
     RETURNING project.id`,
    [
      input.projectID,
      input.workspaceID,
      input.actorID,
      input.archived ? new Date() : null,
    ]
  );
  if (!result.rowCount) throw new Error("Project administration denied");
}

export async function updateZeroWorkspaceMemberRole(input: {
  actorID: string;
  workspaceID: string;
  memberUserID: string;
  role: "ADMIN" | "MEMBER";
}) {
  await getZeroDatabase().transaction(async (tx) => {
    await zeroMutators.workspaceMembers.setRole.fn({
      args: {
        workspaceID: input.workspaceID,
        userID: input.memberUserID,
        role: input.role,
      },
      ctx: { userID: input.actorID },
      tx,
    });
  });
}

export async function removeZeroWorkspaceMember(input: {
  actorID: string;
  workspaceID: string;
  memberUserID: string;
}) {
  if (input.actorID === input.memberUserID) {
    throw new Error("Cannot remove current user");
  }
  const result = await getZeroPool().query(
    `DELETE FROM workspace_members AS target
     USING workspace_members AS caller
     WHERE
       target.workspace_id = $1
       AND target.user_id = $2
       AND target.role <> 'OWNER'
       AND caller.workspace_id = target.workspace_id
       AND caller.user_id = $3
       AND caller.role IN ('OWNER', 'ADMIN')
     RETURNING target.user_id`,
    [input.workspaceID, input.memberUserID, input.actorID]
  );
  if (!result.rowCount) throw new Error("Workspace member removal denied");
}
