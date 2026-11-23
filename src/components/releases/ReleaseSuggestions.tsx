"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Button from "@/components/ui/Button";
import FormDialog from "@/components/ui/FormDialog";
import MenuSelect from "@/components/ui/MenuSelect";
import { proposeReleasesAction, saveSuggestedReleaseAction } from "@/server/actions/releases";
import type { ReleaseSuggestion } from "@/shared/releases";

export default function ReleaseSuggestions({ projects }: {
  projects: { id: string; name: string }[];
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [projectId, setProjectId] = useState("");
  const [analysis, setAnalysis] = useState<{ count: number; suggestions: ReleaseSuggestion[] } | null>(null);
  const [chosen, setChosen] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [analyzing, startAnalysis] = useTransition();
  const [saving, startSave] = useTransition();
  const selected = analysis?.suggestions[chosen];

  function analyze(id: string) {
    setProjectId(id);
    setAnalysis(null);
    setChosen(0);
    setError(null);
    if (!id) return;
    startAnalysis(async () => {
      const result = await proposeReleasesAction(id).catch(() => null);
      if (result?.ok) setAnalysis(result);
      else setError(result?.formError ?? "Не удалось проанализировать бэклог.");
    });
  }

  function save() {
    if (!selected) return;
    setError(null);
    startSave(async () => {
      const result = await saveSuggestedReleaseAction({
        projectId,
        title: selected.title,
        goal: selected.reason,
        issueIds: selected.issues.map(({ id }) => id),
      }).catch(() => null);
      if (result?.ok) {
        setOpen(false);
        router.push(result.href);
      } else setError(result?.formError ?? "Не удалось сохранить черновик.");
    });
  }

  return (
    <>
      <Button variant="secondary" onClick={() => {
        setOpen(true);
        analyze(projects.length === 1 ? projects[0].id : "");
      }}>
        Предложить релизы
      </Button>
      {open ? (
        <FormDialog title="Предложения по релизам" submitLabel="Сохранить черновик"
          pending={saving} disabled={!selected || analyzing} error={error}
          onClose={() => { if (!analyzing) setOpen(false); }}
          onSubmit={(event) => { event.preventDefault(); save(); }}>
          {projects.length > 1 ? (
            <MenuSelect ariaLabel="Проект для анализа" value={projectId} onChange={analyze} disabled={analyzing || saving}
              options={[
                { value: "", label: "Выберите проект" },
                ...projects.map(({ id, name }) => ({ value: id, label: name })),
              ]} />
          ) : null}
          {analyzing ? <p role="status" className="text-sm text-[var(--muted)]">Анализируем бэклог…</p> : null}
          {analysis ? (
            <div className="max-h-[50vh] space-y-3 overflow-y-auto pr-1">
              <p className="text-sm text-[var(--muted)]">Проанализировано задач: {analysis.count}</p>
              {analysis.suggestions.length ? (
                <fieldset className="space-y-2">
                  <legend className="sr-only">Набор задач для черновика</legend>
                  {analysis.suggestions.map((suggestion, index) => (
                    <div key={suggestion.issues[0].id} className="rounded-lg border border-[var(--sep)] px-3 py-2">
                      <label className="flex cursor-pointer items-start gap-2">
                        <input type="radio" name="release-suggestion" checked={chosen === index}
                          className="mt-1 accent-cyan-400" disabled={saving} onChange={() => setChosen(index)} />
                        <span className="min-w-0">
                          <span className="block break-words text-sm font-medium">{suggestion.title} · {suggestion.issues.length}</span>
                          <span className="block break-words text-xs text-[var(--muted)]">{suggestion.reason}</span>
                        </span>
                      </label>
                      {chosen === index ? (
                        <ul className="ml-5 mt-2 space-y-1 border-t border-[var(--sep)] pt-2">
                          {suggestion.issues.map((issue) => (
                            <li key={issue.id} className="break-words text-xs">
                              <span className="mr-2 font-mono text-[var(--muted)]">{issue.key}</span>{issue.title}
                            </li>
                          ))}
                        </ul>
                      ) : null}
                    </div>
                  ))}
                </fieldset>
              ) : <p className="text-sm">Не нашли достаточно связанных задач для черновика.</p>}
            </div>
          ) : null}
          {error && projectId && !analyzing ? (
            <Button variant="ghost" disabled={saving} onClick={() => analyze(projectId)}>Обновить предложения</Button>
          ) : null}
        </FormDialog>
      ) : null}
    </>
  );
}
