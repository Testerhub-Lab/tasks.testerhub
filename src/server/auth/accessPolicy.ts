import { ProjectRole } from "@prisma/client";

const PROJECT_ROLE_RANK: Record<ProjectRole, number> = {
  VIEWER: 1,
  MEMBER: 2,
  ADMIN: 3,
};

export function projectRoleAtLeast(
  actual: ProjectRole,
  required: ProjectRole
): boolean {
  return PROJECT_ROLE_RANK[actual] >= PROJECT_ROLE_RANK[required];
}

export function mergeProjectMembership(
  existing: { role: ProjectRole; expiresAt: Date | null } | null,
  invited: { role: ProjectRole; expiresAt: Date | null }
) {
  const role =
    existing && projectRoleAtLeast(existing.role, invited.role)
      ? existing.role
      : invited.role;
  const expiresAt =
    existing?.expiresAt === null || invited.expiresAt === null
      ? null
      : existing?.expiresAt && existing.expiresAt > invited.expiresAt
        ? existing.expiresAt
        : invited.expiresAt;

  return { role, expiresAt };
}
