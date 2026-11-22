"use client";

import { Dialog, DialogPanel, DialogTitle } from "@headlessui/react";
import type { FormEvent, ReactNode } from "react";
import Button from "@/components/ui/Button";

export default function FormDialog({
  title, children, submitLabel, pending, disabled, error, onClose, onSubmit,
}: {
  title: string;
  children: ReactNode;
  submitLabel: string;
  pending: boolean;
  disabled?: boolean;
  error: string | null;
  onClose: () => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
}) {
  const close = () => {
    if (!pending) onClose();
  };

  return (
    <Dialog open onClose={close} className="relative z-[100]">
      <div className="fixed inset-0 bg-black/60" aria-hidden="true" />
      <div className="fixed inset-0 flex items-center justify-center overflow-y-auto p-4">
        <DialogPanel className="w-full max-w-md rounded-xl border border-[var(--color-card-border)] bg-[var(--surface-dialog)] p-5 shadow-xl">
          <DialogTitle className="text-lg font-semibold">{title}</DialogTitle>
          <form onSubmit={onSubmit} className="mt-4 space-y-4">
            {children}
            {error ? <p role="alert" className="text-sm text-rose-300">{error}</p> : null}
            <div className="flex flex-wrap justify-end gap-2">
              <Button variant="ghost" onClick={close} disabled={pending}>Отмена</Button>
              <Button type="submit" disabled={disabled || pending}>
                {pending ? "Сохраняем…" : submitLabel}
              </Button>
            </div>
          </form>
        </DialogPanel>
      </div>
    </Dialog>
  );
}
