"use client";

import React, { useMemo, useState } from "react";
import Button from "@/components/ui/Button";
import Input from "@/components/ui/Input";
import { toast } from "@/components/ui/toast";
import {
  createWorkspaceProjectAction,
  setProjectArchivedAction,
} from "@/server/actions/workspaces";
import { useRouter } from "next/navigation";

interface ProjectRow {
  id: string;
  key: string;
  name: string;
  allowGuest: boolean;
  archivedAt?: string | null;
}

interface WorkspaceProjectsClientProps {
  workspaceId: string;
  projects: ProjectRow[];
}

const WorkspaceProjectsClient: React.FC<WorkspaceProjectsClientProps> = ({
  workspaceId,
  projects,
}) => {
  const [key, setKey] = useState("");
  const [name, setName] = useState("");
  const [allowGuest, setAllowGuest] = useState(true);
  const [creating, setCreating] = useState(false);
  const router = useRouter();

  const sorted = useMemo(() => {
    return [...projects].sort((a, b) => a.key.localeCompare(b.key));
  }, [projects]);

  const handleCreate = async () => {
    const trimmedKey = key.trim().toUpperCase();
    const trimmedName = name.trim();
    if (trimmedKey.length < 2 || trimmedName.length < 2) {
      toast.error("Укажите ключ и название проекта");
      return;
    }

    setCreating(true);
    const res = await createWorkspaceProjectAction({
      workspaceId,
      key: trimmedKey,
      name: trimmedName,
      allowGuest,
    });
    setCreating(false);

    if (!res.ok) {
      toast.error("Не удалось создать проект", res.formError ?? "Попробуйте позже.");
      return;
    }

    setKey("");
    setName("");
    toast.success("Project created");
    router.refresh();
  };

  const handleArchiveToggle = async (projectId: string, archived: boolean) => {
    const res = await setProjectArchivedAction({ workspaceId, projectId, archived });
    if (!res.ok) {
      toast.error("Не удалось обновить проект", res.formError ?? "Попробуйте позже.");
      return;
    }
    toast.success(archived ? "Project archived" : "Project restored");
    router.refresh();
  };

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-base font-semibold text-white">Projects</h2>
        <span className="text-xs text-white/40">{projects.length} total</span>
      </div>

      <div className="surface rounded-[var(--radius-lg)] p-4">
        <div className="grid gap-3 md:grid-cols-[120px_minmax(0,1fr)_auto_auto]">
          <Input
            value={key}
            onChange={(event) => setKey(event.target.value.toUpperCase())}
            placeholder="KEY"
            className="h-7 text-[11px] uppercase"
            maxLength={6}
          />
          <Input
            value={name}
            onChange={(event) => setName(event.target.value)}
            placeholder="Project name"
            className="h-7 text-[11px]"
            maxLength={60}
          />
          <label className="flex items-center gap-2 text-xs text-white/60">
            <input
              type="checkbox"
              checked={allowGuest}
              onChange={(event) => setAllowGuest(event.target.checked)}
              className="h-4 w-4 accent-[var(--color-primary)]"
            />
            Guests
          </label>
          <Button
            variant="primary"
            className="h-7 px-3 text-[11px]"
            onClick={handleCreate}
            disabled={creating}
          >
            {creating ? "Creating..." : "Add"}
          </Button>
        </div>
      </div>

      <div className="surface rounded-[var(--radius-lg)]">
        <div className="grid grid-cols-[120px_minmax(0,1fr)_100px_auto] gap-2 border-b border-white/5 px-4 py-2 text-[10px] uppercase tracking-wide text-white/40">
          <span>Key</span>
          <span>Name</span>
          <span>Guests</span>
          <span className="text-right">Actions</span>
        </div>
        <div className="divide-y divide-white/5">
          {sorted.length === 0 ? (
            <div className="px-4 py-4 text-sm text-[var(--color-text-secondary)]">
              Проектов пока нет.
            </div>
          ) : (
            sorted.map((project) => (
              <div
                key={project.id}
                className="grid grid-cols-[120px_minmax(0,1fr)_100px_auto] items-center gap-2 px-4 py-2"
              >
                <span className="text-xs text-white/80">{project.key}</span>
                <span className="truncate text-sm text-white">
                  {project.name}
                  {project.archivedAt ? (
                    <span className="ml-2 rounded-full border border-white/10 bg-white/5 px-2 py-0.5 text-[10px] text-white/60">
                      archived
                    </span>
                  ) : null}
                </span>
                <span className="text-xs text-white/60">
                  {project.allowGuest ? "Enabled" : "Disabled"}
                </span>
                <div className="flex justify-end">
                  <Button
                    variant="ghost"
                    className="h-6 px-2 text-[11px]"
                    onClick={() => handleArchiveToggle(project.id, !project.archivedAt)}
                  >
                    {project.archivedAt ? "Restore" : "Archive"}
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

export default WorkspaceProjectsClient;
