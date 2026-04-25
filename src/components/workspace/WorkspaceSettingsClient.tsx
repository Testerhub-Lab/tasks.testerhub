"use client";

import React, { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Input from "@/components/ui/Input";
import Button from "@/components/ui/Button";
import { toast } from "@/components/ui/toast";
import {
  updateWorkspaceAction,
  createWorkspaceInviteAction,
} from "@/server/actions/workspaces";

interface WorkspaceSettingsClientProps {
  workspaceId: string;
  initialName: string;
  canEdit: boolean;
}

const WorkspaceSettingsClient: React.FC<WorkspaceSettingsClientProps> = ({
  workspaceId,
  initialName,
  canEdit,
}) => {
  const [name, setName] = useState(initialName);
  const [baseName, setBaseName] = useState(initialName);
  const [saving, setSaving] = useState(false);
  const [copyingLink, setCopyingLink] = useState(false);
  const router = useRouter();

  const isDirty = useMemo(() => name.trim() !== baseName.trim(), [name, baseName]);

  const handleSave = async () => {
    if (!canEdit) return;
    const trimmed = name.trim();
    if (!trimmed) {
      toast.error("Workspace name is required");
      return;
    }

    setSaving(true);
    const res = await updateWorkspaceAction({ workspaceId, name: trimmed });
    setSaving(false);

    if (!res.ok) {
      toast.error("Unable to update workspace", res.formError ?? "Попробуйте позже.");
      return;
    }

    setBaseName(trimmed);
    setName(trimmed);
    toast.success("Workspace updated");
  };

  const handleCopyInvite = async () => {
    if (!canEdit || copyingLink) return;
    setCopyingLink(true);
    const res = await createWorkspaceInviteAction({ workspaceId });
    setCopyingLink(false);

    if (!res.ok || !res.link) {
      toast.error("Не удалось создать ссылку", res.formError ?? "Попробуйте позже.");
      return;
    }

    try {
      await navigator.clipboard.writeText(res.link);
      toast.success("Invite link copied");
    } catch {
      toast.error("Не удалось скопировать ссылку");
    }

    router.refresh();
  };

  return (
    <div className="space-y-3">
      <div className="space-y-0.5">
        <h1 className="text-xl font-semibold text-white">Workspace settings</h1>
      </div>

      <div className="surface rounded-[var(--radius-lg)] p-4">
        <div className="flex flex-col gap-3">
          <div className="space-y-2">
            <div className="flex items-center justify-between gap-3">
              <label className="text-xs text-[var(--color-text-secondary)]">Name</label>
              <button
                type="button"
                onClick={handleCopyInvite}
                className="flex items-center gap-2 text-[11px] text-[var(--color-text-secondary)] transition hover:text-white"
              >
                <svg
                  width="14"
                  height="14"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <path d="M10 13a5 5 0 0 1 0-7l2-2a5 5 0 0 1 7 7l-1 1" />
                  <path d="M14 11a5 5 0 0 1 0 7l-2 2a5 5 0 0 1-7-7l1-1" />
                </svg>
                {copyingLink ? "Copying..." : "Copy invite"}
              </button>
            </div>
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Workspace name"
              disabled={!canEdit || saving}
              maxLength={80}
            />
            {!canEdit ? (
              <p className="text-xs text-[var(--color-text-secondary)]">
                Только админы могут менять название воркспейса.
              </p>
            ) : null}
          </div>

          <div className="flex items-center justify-end gap-2">
            <Button
              variant="ghost"
              type="button"
              onClick={() => setName(baseName)}
              className="h-7 px-3 text-[11px]"
              disabled={!isDirty || saving}
            >
              Reset
            </Button>
            <Button
              variant="primary"
              type="button"
              onClick={handleSave}
              className="h-7 px-3 text-[11px]"
              disabled={!isDirty || saving || !canEdit}
            >
              {saving ? "Saving..." : "Save changes"}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default WorkspaceSettingsClient;
