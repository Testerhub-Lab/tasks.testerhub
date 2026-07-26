"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Button from "@/components/ui/Button";
import { toast } from "@/components/ui/toast";
import {
  createWorkspaceInviteAction,
  removeProjectMemberAction,
  updateProjectMemberExpiryAction,
  updateProjectMemberRoleAction,
} from "@/server/actions/workspaces";

type ProjectRole = "ADMIN" | "MEMBER" | "VIEWER";

type ProjectOption = {
  id: string;
  key: string;
  name: string;
};

type ProjectMemberRow = {
  id: string;
  projectId: string;
  role: ProjectRole;
  expiresAt: string | null;
  isExpired: boolean;
  user: {
    id: string;
    name: string | null;
    email: string;
  };
};

interface ProjectAccessClientProps {
  workspaceId: string;
  currentUserId: string;
  projects: ProjectOption[];
  members: ProjectMemberRow[];
}

const durationOptions = [
  { value: "permanent", label: "Без срока", days: null },
  { value: "1", label: "1 день", days: 1 },
  { value: "7", label: "7 дней", days: 7 },
  { value: "30", label: "30 дней", days: 30 },
  { value: "90", label: "90 дней", days: 90 },
] as const;

export default function ProjectAccessClient({
  workspaceId,
  currentUserId,
  projects,
  members,
}: ProjectAccessClientProps) {
  const router = useRouter();
  const [projectId, setProjectId] = useState(projects[0]?.id ?? "");
  const [inviteRole, setInviteRole] = useState<"MEMBER" | "VIEWER">("MEMBER");
  const [inviteDuration, setInviteDuration] = useState("permanent");
  const [creatingInvite, setCreatingInvite] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);

  const selectedMembers = useMemo(
    () => members.filter((member) => member.projectId === projectId),
    [members, projectId]
  );

  const handleInvite = async () => {
    if (!projectId || creatingInvite) return;
    const duration = durationOptions.find(
      (option) => option.value === inviteDuration
    );
    setCreatingInvite(true);
    const result = await createWorkspaceInviteAction({
      workspaceId,
      projectId,
      projectRole: inviteRole,
      accessDurationDays: duration?.days ?? null,
    });
    setCreatingInvite(false);

    if (!result.ok || !result.link) {
      toast.error(
        "Не удалось создать приглашение",
        result.formError ?? "Попробуйте позже."
      );
      return;
    }

    try {
      await navigator.clipboard.writeText(result.link);
      toast.success("Ссылка приглашения скопирована");
    } catch {
      window.prompt("Скопируйте ссылку приглашения", result.link);
    }
    router.refresh();
  };

  const handleRoleChange = async (
    projectMemberId: string,
    role: ProjectRole
  ) => {
    setBusyId(projectMemberId);
    const result = await updateProjectMemberRoleAction({
      workspaceId,
      projectMemberId,
      role,
    });
    setBusyId(null);

    if (!result.ok) {
      toast.error("Не удалось изменить роль", result.formError ?? "Попробуйте позже.");
      return;
    }
    toast.success("Роль обновлена");
    router.refresh();
  };

  const handleExpiryChange = async (
    projectMemberId: string,
    value: string
  ) => {
    const duration = durationOptions.find((option) => option.value === value);
    if (!duration) return;

    setBusyId(projectMemberId);
    const result = await updateProjectMemberExpiryAction({
      workspaceId,
      projectMemberId,
      accessDurationDays: duration.days,
    });
    setBusyId(null);

    if (!result.ok) {
      toast.error(
        "Не удалось изменить срок доступа",
        result.formError ?? "Попробуйте позже."
      );
      return;
    }
    toast.success("Срок доступа обновлён");
    router.refresh();
  };

  const handleRemove = async (projectMemberId: string) => {
    if (!confirm("Отозвать доступ пользователя к этому проекту?")) return;

    setBusyId(projectMemberId);
    const result = await removeProjectMemberAction({
      workspaceId,
      projectMemberId,
    });
    setBusyId(null);

    if (!result.ok) {
      toast.error("Не удалось отозвать доступ", result.formError ?? "Попробуйте позже.");
      return;
    }
    toast.success("Доступ отозван");
    router.refresh();
  };

  if (projects.length === 0) {
    return (
      <div className="surface rounded-[var(--radius-lg)] p-4 text-sm text-white/60">
        Создайте проект, чтобы приглашать участников.
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div>
        <h2 className="text-base font-semibold text-white">Project access</h2>
        <p className="mt-1 text-xs text-white/45">
          Участники видят только выбранные проекты. Администраторы воркспейса
          имеют доступ ко всем проектам автоматически.
        </p>
      </div>

      <div className="surface grid gap-3 rounded-[var(--radius-lg)] p-4 md:grid-cols-[minmax(180px,1fr)_130px_130px_auto]">
        <select
          value={projectId}
          onChange={(event) => setProjectId(event.target.value)}
          className="h-8 rounded-md border border-white/10 bg-[#11162a] px-2 text-xs text-white"
        >
          {projects.map((project) => (
            <option key={project.id} value={project.id}>
              {project.key} — {project.name}
            </option>
          ))}
        </select>
        <select
          value={inviteRole}
          onChange={(event) =>
            setInviteRole(event.target.value as "MEMBER" | "VIEWER")
          }
          className="h-8 rounded-md border border-white/10 bg-[#11162a] px-2 text-xs text-white"
        >
          <option value="MEMBER">Member</option>
          <option value="VIEWER">Viewer</option>
        </select>
        <select
          value={inviteDuration}
          onChange={(event) => setInviteDuration(event.target.value)}
          className="h-8 rounded-md border border-white/10 bg-[#11162a] px-2 text-xs text-white"
        >
          {durationOptions.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
        <Button
          variant="primary"
          className="h-8 px-3 text-xs"
          disabled={creatingInvite}
          onClick={handleInvite}
        >
          {creatingInvite ? "Создание..." : "Создать приглашение"}
        </Button>
      </div>

      <div className="surface rounded-[var(--radius-lg)]">
        <div className="grid grid-cols-[minmax(0,2fr)_120px_160px_auto] gap-2 border-b border-white/5 px-4 py-2 text-[10px] uppercase tracking-wide text-white/40">
          <span>User</span>
          <span>Role</span>
          <span>Access</span>
          <span className="text-right">Actions</span>
        </div>
        <div className="divide-y divide-white/5">
          {selectedMembers.length === 0 ? (
            <div className="px-4 py-5 text-sm text-white/50">
              У проекта пока нет отдельных участников.
            </div>
          ) : (
            selectedMembers.map((member) => {
              const isSelf = member.user.id === currentUserId;
              const isBusy = busyId === member.id;
              const expired = member.isExpired;

              return (
                <div
                  key={member.id}
                  className="grid grid-cols-[minmax(0,2fr)_120px_160px_auto] items-center gap-2 px-4 py-3"
                >
                  <div className="min-w-0">
                    <div className="truncate text-sm text-white">
                      {member.user.name || member.user.email}
                    </div>
                    <div className="truncate text-xs text-white/40">
                      {member.user.email}
                    </div>
                  </div>
                  <select
                    value={member.role}
                    disabled={isBusy || isSelf}
                    onChange={(event) =>
                      handleRoleChange(
                        member.id,
                        event.target.value as ProjectRole
                      )
                    }
                    className="h-7 rounded-md border border-white/10 bg-[#11162a] px-2 text-xs text-white disabled:opacity-50"
                  >
                    <option value="ADMIN">Admin</option>
                    <option value="MEMBER">Member</option>
                    <option value="VIEWER">Viewer</option>
                  </select>
                  <div className="space-y-1">
                    <div
                      className={`text-xs ${expired ? "text-red-300" : "text-white/60"}`}
                    >
                      {member.expiresAt
                        ? expired
                          ? "Истёк"
                          : new Date(member.expiresAt).toLocaleDateString("ru-RU")
                        : "Без срока"}
                    </div>
                    <select
                      defaultValue=""
                      disabled={isBusy || isSelf}
                      onChange={(event) => {
                        if (!event.target.value) return;
                        void handleExpiryChange(member.id, event.target.value);
                        event.target.value = "";
                      }}
                      className="h-6 rounded-md border border-white/10 bg-[#11162a] px-1 text-[11px] text-white/70 disabled:opacity-50"
                    >
                      <option value="">Изменить…</option>
                      {durationOptions.map((option) => (
                        <option key={option.value} value={option.value}>
                          {option.label}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="flex justify-end">
                    <Button
                      variant="ghost"
                      className="h-7 px-2 text-xs text-red-300"
                      disabled={isBusy || isSelf}
                      onClick={() => handleRemove(member.id)}
                    >
                      Revoke
                    </Button>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
}
