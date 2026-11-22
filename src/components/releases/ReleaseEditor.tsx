"use client";

import { useState, useTransition, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import Button from "@/components/ui/Button";
import Input from "@/components/ui/Input";
import Select from "@/components/ui/Select";
import Textarea from "@/components/ui/Textarea";
import { isAuthRequiredError, showAuthRequiredToast } from "@/lib/authRequired";
import { saveReleaseAction } from "@/server/actions/releases";
import { releaseStatusLabels, type Release, type ReleaseStatus } from "@/shared/releases";
import ReleaseDialog from "./ReleaseDialog";

const statuses = Object.entries(releaseStatusLabels).map(([value, label]) => ({ value, label }));

export default function ReleaseEditor({
  projectId, release,
}: {
  projectId: string;
  release?: Release;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setError(null);
    startTransition(async () => {
      const result = await saveReleaseAction({
        projectId,
        id: release?.id,
        title: String(form.get("title") ?? ""),
        goal: String(form.get("goal") ?? ""),
        plannedDate: String(form.get("plannedDate") ?? "") || null,
        status: release ? form.get("status") as ReleaseStatus : undefined,
      });
      if (!result.ok) {
        if (isAuthRequiredError(result)) showAuthRequiredToast();
        setError(result.formError);
        return;
      }
      setOpen(false);
      if (release) router.refresh();
      else router.push(result.href);
    });
  };

  return (
    <>
      <Button variant={release ? "secondary" : "primary"} onClick={() => {
        setError(null);
        setOpen(true);
      }}>
        {release ? "Редактировать" : "Новый релиз"}
      </Button>
      {open ? (
        <ReleaseDialog
          title={release ? "Редактировать релиз" : "Новый релиз"}
          submitLabel={release ? "Сохранить" : "Создать черновик"}
          pending={pending}
          error={error}
          onClose={() => setOpen(false)}
          onSubmit={submit}
        >
          <label className="grid gap-1 text-sm">
            Название
            <Input name="title" required maxLength={100} defaultValue={release?.title} data-autofocus />
          </label>
          <label className="grid gap-1 text-sm">
            <span>Цель <span className="text-[var(--muted)]">· необязательно</span></span>
            <Textarea name="goal" rows={2} maxLength={400} defaultValue={release?.goal} />
          </label>
          <label className="grid gap-1 text-sm">
            <span>Плановая дата <span className="text-[var(--muted)]">· необязательно</span></span>
            <Input name="plannedDate" type="date" min="0001-01-01" max="9999-12-31" defaultValue={release?.plannedDate ?? ""} />
          </label>
          {release ? (
            <label className="grid gap-1 text-sm">
              Статус
              <Select name="status" options={statuses} defaultValue={release.status} />
            </label>
          ) : null}
        </ReleaseDialog>
      ) : null}
    </>
  );
}
