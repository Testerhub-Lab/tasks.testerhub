import { createBuilder, type Transaction } from "@rocicorp/zero";
import {
  zeroSchema,
  type WorkspaceRole,
  type ZeroSchema,
} from "./schema";

const zql = createBuilder(zeroSchema);

const roleLevel: Record<WorkspaceRole, number> = {
  VIEWER: 0,
  MEMBER: 1,
  ADMIN: 2,
  OWNER: 3,
};

export function workspaceRoleAtLeast(
  actual: WorkspaceRole,
  required: WorkspaceRole
) {
  return roleLevel[actual] >= roleLevel[required];
}

export async function getWorkspaceRole(
  tx: Transaction<ZeroSchema>,
  workspaceID: string,
  userID: string
) {
  const member = await tx.run(
    zql.workspaceMember
      .where("workspaceID", workspaceID)
      .where("userID", userID)
      .one()
  );

  return member?.role ?? null;
}

export async function requireWorkspaceRole(
  tx: Transaction<ZeroSchema>,
  workspaceID: string,
  userID: string,
  required: WorkspaceRole
) {
  const role = await getWorkspaceRole(tx, workspaceID, userID);
  if (!role || !workspaceRoleAtLeast(role, required)) {
    throw new Error("Workspace access denied");
  }

  return role;
}

export function assertCanSetMemberRole(
  callerRole: WorkspaceRole,
  currentRole: WorkspaceRole | null,
  nextRole: Exclude<WorkspaceRole, "OWNER">
) {
  if (!workspaceRoleAtLeast(callerRole, "ADMIN")) {
    throw new Error("Workspace administration denied");
  }
  if (currentRole === "OWNER") {
    throw new Error("Workspace owner role cannot be changed");
  }
  if (callerRole !== "OWNER" && nextRole === "ADMIN") {
    throw new Error("Only the workspace owner can grant admin");
  }
}
