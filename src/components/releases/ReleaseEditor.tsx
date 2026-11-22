"use client";

import { useState, useTransition, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import Button from "@/components/ui/Button";
import Input from "@/components/ui/Input";
import MenuSelect from "@/components/ui/MenuSelect";
import DatePicker from "@/components/ui/DatePicker";
import Textarea from "@/components/ui/Textarea";
import { isAuthRequiredError, showAuthRequiredToast } from "@/lib/authRequired";
import { saveReleaseAction } from "@/server/actions/releases";
import { releaseStatusLabels, type Release, type ReleaseStatus } from "@/shared/releases";
import FormDialog from "@/components/ui/FormDialog";

const statuses = (Object.keys(releaseStatusLabels) as ReleaseStatus[]).map((value) => ({ value, label: releaseStatusLabels[value] }));

export default function ReleaseEditor({
  projectId, release,
}: {
  projectId: string;
  release?: Release;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [plannedDate, setPlannedDate] = useState<string | null>(null);
  const [status, setStatus] = useState<ReleaseStatus>("draft");
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
        plannedDate,
        status: release ? status : undefined,
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
        setPlannedDate(release?.plannedDate ?? null);
        setStatus(release?.status ?? "draft");
        setOpen(true);
      }}>
        {release ? "Редактировать" : "Новый релиз"}
      </Button>
      {open ? (
        <FormDialog
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
          <div className="grid gap-1 text-sm">
            <span>Плановая дата <span className="text-[var(--muted)]">· необязательно</span></span>
            <DatePicker value={plannedDate} onChange={setPlannedDate} />
          </div>
          {release ? (
            <div className="grid gap-1 text-sm">
              <span>Статус</span>
              <MenuSelect ariaLabel="Статус релиза" options={statuses} value={status} onChange={setStatus} />
            </div>
          ) : null}
        </FormDialog>
      ) : null}
    </>
  );
}
