import type { WorkflowCategory } from "./schema";

const RANK_STEP = 1024;
const RANK_WIDTH = 20;

export type DefaultWorkflowState = {
  name: string;
  category: WorkflowCategory;
  color: string;
  rank: string;
};

export const DEFAULT_WORKFLOW_STATES: readonly DefaultWorkflowState[] = [
  {
    name: "Backlog",
    category: "BACKLOG",
    color: "#64748b",
    rank: "00000000000000001024",
  },
  {
    name: "Todo",
    category: "UNSTARTED",
    color: "#3b82f6",
    rank: "00000000000000002048",
  },
  {
    name: "Hold",
    category: "STARTED",
    color: "#a855f7",
    rank: "00000000000000003072",
  },
  {
    name: "In progress",
    category: "STARTED",
    color: "#f59e0b",
    rank: "00000000000000004096",
  },
  {
    name: "Testing",
    category: "STARTED",
    color: "#06b6d4",
    rank: "00000000000000005120",
  },
  {
    name: "Done",
    category: "COMPLETED",
    color: "#10b981",
    rank: "00000000000000006144",
  },
  {
    name: "Rejected",
    category: "CANCELED",
    color: "#ef4444",
    rank: "00000000000000007168",
  },
];

export function rankAfter(ranks: readonly string[]): string {
  const numericRanks = ranks
    .filter((value) => /^\d+$/.test(value))
    .map((value) => Number(value))
    .filter(Number.isSafeInteger);
  const greatest =
    numericRanks.length === 0
      ? 0
      : numericRanks.reduce((current, value) =>
          value > current ? value : current
        );

  return (greatest + RANK_STEP).toString().padStart(RANK_WIDTH, "0");
}

export function issueKey(projectKey: string, issueNumber: number): string {
  return `${projectKey}-${issueNumber}`;
}

export function workspaceSlug(name: string, userID: string): string {
  const base = name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
  const suffix = userID.replace(/-/g, "").slice(0, 8).toLowerCase();

  return `${base || "workspace"}-${suffix}`;
}
