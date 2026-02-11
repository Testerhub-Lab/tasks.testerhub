"use client";

import React, { useMemo, useState } from "react";
import Button from "@/components/ui/Button";
import { toast } from "@/components/ui/toast";
import {
  removeWorkspaceMemberAction,
  updateWorkspaceMemberRoleAction,
  createWorkspaceInviteAction,
} from "@/server/actions/workspaces";
import { useRouter } from "next/navigation";

interface WorkspaceMemberRow {
  id: string;
  role: "ADMIN" | "MEMBER";
  createdAt: string;
  user: { id: string; name: string | null; email: string | null };
}

interface WorkspaceMembersClientProps {
  workspaceId: string;
  currentUserId: string;
  members: WorkspaceMemberRow[];
}

const roleLabel = (role: "ADMIN" | "MEMBER") =>
  role === "ADMIN" ? "Admin" : "Member";

const WorkspaceMembersClient: React.FC<WorkspaceMembersClientProps> = ({
  workspaceId,
  currentUserId,
  members,
}) => {
  const [busyId, setBusyId] = useState<string | null>(null);
  const [creatingInvite, setCreatingInvite] = useState(false);
  const [query, setQuery] = useState("");
  const [roleFilter, setRoleFilter] = useState<"ALL" | "ADMIN" | "MEMBER">("ALL");
  const router = useRouter();

  const filtered = useMemo(() => {
    const term = query.trim().toLowerCase();
    return members.filter((member) => {
      if (roleFilter !== "ALL" && member.role !== roleFilter) return false;
      if (!term) return true;
      const name = member.user.name?.toLowerCase() ?? "";
      const email = member.user.email?.toLowerCase() ?? "";
      return name.includes(term) || email.includes(term);
    });
  }, [members, query, roleFilter]);

  const sorted = useMemo(() => {
    return [...filtered].sort((a, b) => {
      if (a.role !== b.role) return a.role === "ADMIN" ? -1 : 1;
      return a.createdAt.localeCompare(b.createdAt);
    });
  }, [filtered]);

  const handleRoleChange = async (memberId: string, nextRole: "ADMIN" | "MEMBER") => {
    setBusyId(memberId);
    const res = await updateWorkspaceMemberRoleAction({
      workspaceId,
      memberId,
      role: nextRole,
    });
    setBusyId(null);

    if (!res.ok) {
      toast.error("Не удалось обновить роль", res.formError ?? "Попробуйте позже.");
      return;
    }

    toast.success("Role updated");
  };

  const handleRemove = async (memberId: string) => {
    if (!confirm("Удалить участника из воркспейса?") ) return;
    setBusyId(memberId);
    const res = await removeWorkspaceMemberAction({ workspaceId, memberId });
    setBusyId(null);

    if (!res.ok) {
      toast.error("Не удалось удалить", res.formError ?? "Попробуйте позже.");
      return;
    }

    toast.success("Member removed");
  };

  const handleInvite = async () => {
    if (creatingInvite) return;
    setCreatingInvite(true);
    const res = await createWorkspaceInviteAction({ workspaceId });
    setCreatingInvite(false);

    if (!res.ok || !res.link) {
      toast.error("Не удалось создать ссылку", res.formError ?? "Попробуйте позже.");
      return;
    }

    try {
      await navigator.clipboard.writeText(res.link);
      toast.success("Invite link copied");
    } catch {
      toast.info("Invite link created", "Скопируйте вручную");
    }

    router.refresh();
  };

  return (
      <div className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="space-y-1">
            <h2 className="text-base font-semibold text-white">Members</h2>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Button
              variant="ghost"
              className="h-7 px-3 text-[11px]"
              onClick={handleInvite}
              disabled={creatingInvite}
            >
              {creatingInvite ? "Creating..." : "+ Invite"}
            </Button>
            <div className="flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-2 py-1">
              <input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Search member"
                className="h-6 w-32 bg-transparent text-[11px] text-white/80 outline-none placeholder:text-white/40"
              />
              <div className="flex items-center gap-1 text-xs text-white/70">
                {(["ALL", "ADMIN", "MEMBER"] as const).map((role) => (
                  <button
                    key={role}
                    type="button"
                    onClick={() => setRoleFilter(role)}
                    className={`rounded-full px-2 py-1 transition ${
                      roleFilter === role
                        ? "bg-white/10 text-white"
                        : "text-white/60 hover:text-white"
                    }`}
                  >
                    {role === "ALL" ? "All" : roleLabel(role)}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>

      <div className="surface rounded-[var(--radius-lg)]">
        <div className="grid grid-cols-[2fr_1fr_auto] gap-2 border-b border-white/5 px-4 py-2 text-[10px] uppercase tracking-wide text-white/40">
          <span>User</span>
          <span>Role</span>
          <span className="text-right">Actions</span>
        </div>
        <div className="divide-y divide-white/5">
          {sorted.length === 0 ? (
            <div className="px-5 py-6 text-sm text-[var(--color-text-secondary)]">
              No members found.
            </div>
          ) : (
            sorted.map((member) => {
            const displayName = member.user.name || member.user.email || "User";
            const isSelf = member.user.id === currentUserId;
            const isBusy = busyId === member.id;

            return (
              <div
                key={member.id}
                className="grid grid-cols-[2fr_1fr_auto] items-center gap-2 px-4 py-2"
              >
                <div className="flex min-w-0 items-center gap-2">
                  <span className="truncate text-sm text-white">{displayName}</span>
                  {member.user.email ? (
                    <span className="truncate text-xs text-white/40">{member.user.email}</span>
                  ) : null}
                </div>

                <div className="flex items-center gap-2">
                  <span className="text-xs text-white/60">{roleLabel(member.role)}</span>
                </div>

                <div className="flex justify-end">
                  <details className="relative">
                    <summary className="list-none cursor-pointer rounded-md px-2 py-1 text-xs text-white/70 hover:bg-white/5">
                      ⋯
                    </summary>
                    <div className="absolute right-0 z-10 mt-2 min-w-[140px] rounded-md border border-white/10 bg-[#11162a] p-1 shadow-lg">
                      <button
                        type="button"
                        className="w-full rounded px-2 py-1 text-left text-xs text-white/70 hover:bg-white/5 disabled:opacity-50"
                        disabled={isBusy || isSelf || member.role === "ADMIN"}
                        onClick={() => handleRoleChange(member.id, "ADMIN")}
                      >
                        Make admin
                      </button>
                      <button
                        type="button"
                        className="w-full rounded px-2 py-1 text-left text-xs text-white/70 hover:bg-white/5 disabled:opacity-50"
                        disabled={isBusy || isSelf || member.role === "MEMBER"}
                        onClick={() => handleRoleChange(member.id, "MEMBER")}
                      >
                        Make member
                      </button>
                      <div className="my-1 h-px bg-white/5" />
                      <button
                        type="button"
                        className="w-full rounded px-2 py-1 text-left text-xs text-red-300 hover:bg-white/5 disabled:opacity-50"
                        disabled={isBusy || isSelf}
                        onClick={() => handleRemove(member.id)}
                      >
                        Remove
                      </button>
                    </div>
                  </details>
                </div>
              </div>
            );
            })
          )}
        </div>
      </div>
    </div>
  );
};

export default WorkspaceMembersClient;
