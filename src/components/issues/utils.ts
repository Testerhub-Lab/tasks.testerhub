const statusLabelMap: Record<string, string> = {
  new: "New",
  open: "New",
  todo: "New",
  backlog: "New",
  in_progress: "In Progress",
  progress: "In Progress",
  testing: "Testing",
  qa: "Testing",
  review: "Testing",
  done: "Done",
  closed: "Done",
  resolved: "Done",
};

export const getStatusLabel = (status?: string | null) => {
  if (!status) {
    return "New";
  }
  const normalized = status.toLowerCase().replace(/\s+/g, "_");
  return statusLabelMap[normalized] ?? status;
};

export const getPriorityClasses = (priority?: string | null) => {
  switch (priority?.toLowerCase()) {
    case "critical":
      return "border-red-400/40 text-red-200 bg-red-500/10";
    case "high":
      return "border-orange-400/40 text-orange-200 bg-orange-500/10";
    case "medium":
      return "border-amber-400/40 text-amber-200 bg-amber-500/10";
    case "low":
      return "border-emerald-400/40 text-emerald-200 bg-emerald-500/10";
    default:
      return "border-[var(--color-card-border)] text-[var(--color-text-secondary)] bg-[var(--color-card-bg)]";
  }
};
