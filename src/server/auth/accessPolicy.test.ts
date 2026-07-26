import { describe, expect, it } from "vitest";
import { ProjectRole } from "@prisma/client";
import {
  mergeProjectMembership,
  projectRoleAtLeast,
} from "./accessPolicy";

describe("projectRoleAtLeast", () => {
  it("keeps viewer read-only", () => {
    expect(
      projectRoleAtLeast(ProjectRole.VIEWER, ProjectRole.VIEWER)
    ).toBe(true);
    expect(
      projectRoleAtLeast(ProjectRole.VIEWER, ProjectRole.MEMBER)
    ).toBe(false);
  });

  it("allows members to write but not administer", () => {
    expect(
      projectRoleAtLeast(ProjectRole.MEMBER, ProjectRole.VIEWER)
    ).toBe(true);
    expect(
      projectRoleAtLeast(ProjectRole.MEMBER, ProjectRole.MEMBER)
    ).toBe(true);
    expect(
      projectRoleAtLeast(ProjectRole.MEMBER, ProjectRole.ADMIN)
    ).toBe(false);
  });

  it("allows admins to perform every project action", () => {
    for (const role of Object.values(ProjectRole)) {
      expect(projectRoleAtLeast(ProjectRole.ADMIN, role)).toBe(true);
    }
  });
});

describe("mergeProjectMembership", () => {
  const earlier = new Date("2026-08-01T00:00:00.000Z");
  const later = new Date("2026-09-01T00:00:00.000Z");

  it("creates access from an invitation", () => {
    expect(
      mergeProjectMembership(null, {
        role: ProjectRole.MEMBER,
        expiresAt: earlier,
      })
    ).toEqual({ role: ProjectRole.MEMBER, expiresAt: earlier });
  });

  it("does not downgrade an existing role", () => {
    expect(
      mergeProjectMembership(
        { role: ProjectRole.ADMIN, expiresAt: earlier },
        { role: ProjectRole.VIEWER, expiresAt: later }
      )
    ).toEqual({ role: ProjectRole.ADMIN, expiresAt: later });
  });

  it("does not shorten permanent access", () => {
    expect(
      mergeProjectMembership(
        { role: ProjectRole.MEMBER, expiresAt: null },
        { role: ProjectRole.VIEWER, expiresAt: earlier }
      )
    ).toEqual({ role: ProjectRole.MEMBER, expiresAt: null });
  });

  it("promotes a temporary member to permanent access", () => {
    expect(
      mergeProjectMembership(
        { role: ProjectRole.VIEWER, expiresAt: earlier },
        { role: ProjectRole.MEMBER, expiresAt: null }
      )
    ).toEqual({ role: ProjectRole.MEMBER, expiresAt: null });
  });

  it("uses the invitation role when expired access is excluded", () => {
    expect(
      mergeProjectMembership(null, {
        role: ProjectRole.VIEWER,
        expiresAt: later,
      })
    ).toEqual({ role: ProjectRole.VIEWER, expiresAt: later });
  });
});
