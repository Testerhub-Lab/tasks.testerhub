"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Button from "@/components/ui/Button";
import Input from "@/components/ui/Input";
import { toast } from "@/components/ui/toast";
import { updateProjectKnowledgeAction } from "@/server/knowledge/actions";

type Provider = "DISABLED" | "NATIVE" | "EXTERNAL";

type KnowledgeProject = {
  id: string;
  key: string;
  name: string;
  archivedAt: string | null;
  provider: Provider;
  externalUrl: string | null;
};

type ProjectKnowledgeSettingsClientProps = {
  projects: KnowledgeProject[];
};

export default function ProjectKnowledgeSettingsClient({
  projects,
}: ProjectKnowledgeSettingsClientProps) {
  const router = useRouter();
  const [projectId, setProjectId] = useState(projects[0]?.id ?? "");
  const selected = projects.find((project) => project.id === projectId);
  const [provider, setProvider] = useState<Provider>(
    selected?.provider ?? "DISABLED"
  );
  const [externalUrl, setExternalUrl] = useState(selected?.externalUrl ?? "");
  const [saving, setSaving] = useState(false);

  if (!selected) return null;

  const handleProjectChange = (nextId: string) => {
    const next = projects.find((project) => project.id === nextId);
    if (!next) return;
    setProjectId(nextId);
    setProvider(next.provider);
    setExternalUrl(next.externalUrl ?? "");
  };

  const handleSave = async () => {
    setSaving(true);
    const result = await updateProjectKnowledgeAction({
      projectId: selected.id,
      provider,
      externalUrl: provider === "EXTERNAL" ? externalUrl : null,
    });
    setSaving(false);

    if (!result.ok) {
      toast.error("Не удалось обновить Wiki", result.formError);
      return;
    }

    toast.success("Настройки Wiki сохранены");
    router.refresh();
  };

  return (
    <div className="space-y-3">
      <div>
        <h2 className="text-base font-semibold text-white">Wiki проекта</h2>
        <p className="mt-1 text-xs text-white/45">
          Нативная Wiki использует права проекта. Внешний провайдер заменяет её
          одной ссылкой; существующие страницы при переключении не удаляются.
        </p>
      </div>
      <div className="surface grid gap-3 rounded-[var(--radius-lg)] p-4 md:grid-cols-[minmax(180px,1fr)_180px_minmax(220px,1.2fr)_auto]">
        <select
          value={projectId}
          onChange={(event) => handleProjectChange(event.target.value)}
          className="h-10 rounded-md border border-white/10 bg-[#11162a] px-3 text-sm text-white"
        >
          {projects.map((project) => (
            <option key={project.id} value={project.id}>
              {project.key} — {project.name}
              {project.archivedAt ? " (архив)" : ""}
            </option>
          ))}
        </select>
        <select
          value={provider}
          onChange={(event) => setProvider(event.target.value as Provider)}
          className="h-10 rounded-md border border-white/10 bg-[#11162a] px-3 text-sm text-white"
        >
          <option value="DISABLED">Отключена</option>
          <option value="NATIVE">Нативная Pulsar</option>
          <option value="EXTERNAL">Внешний сервис</option>
        </select>
        {provider === "EXTERNAL" ? (
          <Input
            type="url"
            value={externalUrl}
            onChange={(event) => setExternalUrl(event.target.value)}
            placeholder="https://notion.so/…"
            aria-label="Ссылка на внешнюю Wiki"
          />
        ) : (
          <div className="flex items-center text-xs text-white/45">
            {provider === "NATIVE"
              ? "Доступ наследуется от участников проекта."
              : "Пункт Wiki будет скрыт для этого проекта."}
          </div>
        )}
        <Button
          onClick={handleSave}
          disabled={
            saving || (provider === "EXTERNAL" && externalUrl.trim().length === 0)
          }
        >
          {saving ? "Сохраняем…" : "Сохранить"}
        </Button>
      </div>
    </div>
  );
}
