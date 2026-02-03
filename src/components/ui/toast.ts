export type ToastKind = "success" | "error" | "info";

export type ToastItem = {
  id: string;
  kind: ToastKind;
  title: string;
  description?: string;
  createdAt: number;
  durationMs: number;
  action?: { label: string; onClick: () => void };
};

type Listener = (items: ToastItem[]) => void;

let items: ToastItem[] = [];
const listeners = new Set<Listener>();

function emit() {
  for (const l of listeners) l(items);
}

function makeId(): string {
  const c: Crypto | undefined = typeof crypto !== "undefined" ? crypto : undefined;
  if (c && typeof c.randomUUID === "function") return c.randomUUID();
  return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

export function subscribeToToasts(listener: Listener) {
  listeners.add(listener);
  listener(items);
  return () => { listeners.delete(listener); };
}

export function dismissToast(id: string) {
  items = items.filter((t) => t.id !== id);
  emit();
}

export function toast(
  kind: ToastKind,
  title: string,
  description?: string,
  durationMs = 2800,
  action?: { label: string; onClick: () => void }
) {
  const id = makeId();
  const t: ToastItem = {
    id,
    kind,
    title,
    description,
    createdAt: Date.now(),
    durationMs,
    action,
  };
  items = [t, ...items].slice(0, 5);
  emit();

  window.setTimeout(() => dismissToast(id), durationMs);
  return id;
}

toast.success = (title: string, description?: string, durationMs?: number) =>
  toast("success", title, description, durationMs ?? 2400);

toast.error = (title: string, description?: string, durationMs?: number) =>
  toast("error", title, description, durationMs ?? 4200);

toast.info = (title: string, description?: string, durationMs?: number) =>
  toast("info", title, description, durationMs ?? 2800);
