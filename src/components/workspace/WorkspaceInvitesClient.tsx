"use client";

import React, { useState } from "react";
import Button from "@/components/ui/Button";
import { toast } from "@/components/ui/toast";
import {
  createWorkspaceInviteAction,
  revokeWorkspaceInviteAction,
} from "@/server/actions/workspaces";
import { useRouter } from "next/navigation";

interface InviteRow {
  id: string;
  projectLabel: string;
  createdAt: string;
  expiresAt: string;
  link: string;
}

interface WorkspaceInvitesClientProps {
  workspaceId: string;
  invites: InviteRow[];
}

const WorkspaceInvitesClient: React.FC<WorkspaceInvitesClientProps> = ({
  workspaceId,
  invites,
}) => {
  const [busyId, setBusyId] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const router = useRouter();

  const handleCreate = async () => {
    if (creating) return;
    setCreating(true);
    const res = await createWorkspaceInviteAction({ workspaceId });
    setCreating(false);

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

  const handleCopy = async (link: string) => {
    try {
      await navigator.clipboard.writeText(link);
      toast.success("Invite link copied");
    } catch {
      toast.error("Не удалось скопировать ссылку");
    }
  };

  const handleRevoke = async (inviteId: string) => {
    if (!confirm("Отозвать ссылку?")) return;
    setBusyId(inviteId);
    const res = await revokeWorkspaceInviteAction({ workspaceId, inviteId });
    setBusyId(null);

    if (!res.ok) {
      toast.error("Не удалось отозвать", res.formError ?? "Попробуйте позже.");
      return;
    }

    toast.success("Invite revoked");
    router.refresh();
  };

  return (
    <div className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="space-y-1">
            <h2 className="text-base font-semibold text-white">Invites</h2>
          </div>
        <Button
          variant="primary"
          className="h-7 px-3 text-[11px]"
          onClick={handleCreate}
          disabled={creating}
        >
          {creating ? "Creating..." : "New invite"}
        </Button>
      </div>

      <div className="surface rounded-[var(--radius-lg)]">
        <div className="grid grid-cols-[2fr_1fr_1fr_auto] gap-2 border-b border-white/5 px-4 py-2 text-[10px] uppercase tracking-wide text-white/40">
          <span>Scope</span>
          <span>Created</span>
          <span>Expires</span>
          <span className="text-right">Actions</span>
        </div>
        <div className="divide-y divide-white/5">
          {invites.length === 0 ? (
            <div className="px-4 py-4 text-sm text-[var(--color-text-secondary)]">
              Активных invite-ссылок пока нет.
            </div>
          ) : (
            invites.map((invite) => (
              <div
                key={invite.id}
                className="grid grid-cols-[2fr_1fr_1fr_auto] items-center gap-2 px-4 py-3"
              >
                <div className="flex flex-col">
                  <span className="text-sm text-white">{invite.projectLabel}</span>
                  <span className="truncate text-xs text-white/40">{invite.link}</span>
                </div>
                <span className="text-xs text-white/60">{invite.createdAt}</span>
                <span className="text-xs text-white/60">{invite.expiresAt}</span>
                <div className="flex items-center justify-end gap-2">
                  <Button
                    variant="ghost"
                    className="h-6 px-2 text-[11px]"
                    onClick={() => handleCopy(invite.link)}
                  >
                    Copy
                  </Button>
                  <Button
                    variant="ghost"
                    className="h-6 px-2 text-[11px] text-red-300 hover:text-red-200"
                    disabled={busyId === invite.id}
                    onClick={() => handleRevoke(invite.id)}
                  >
                    Revoke
                  </Button>
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
};

export default WorkspaceInvitesClient;
