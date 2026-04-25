"use client";

import React from "react";
import { useRouter } from "next/navigation";
import Badge from "../ui/Badge";
import { formatDate, getPriorityClasses, getStatusLabel } from "./utils";
import type { TaskPriority, TaskStatus } from "../../server/validators/task";
import { getDisplayName } from "../../server/auth/displayName";

interface IssueTableItem {
  id: string;
  key?: string | null;
  title: string;
  status?: TaskStatus | null;
  priority?: TaskPriority | null;
  createdAt?: Date | string | null;
  reporter?: { name: string | null; email: string | null } | null;
  requesterName?: string | null;
}

interface IssueTableProps {
  items: IssueTableItem[];
}

const IssueTable: React.FC<IssueTableProps> = ({ items }) => {
  const router = useRouter();
  return (
    <div className="overflow-hidden rounded-2xl border border-[var(--color-card-border)]">
      <table className="w-full text-left text-sm">
        <thead className="bg-[rgba(18,24,46,0.8)] text-[var(--color-text-secondary)]">
          <tr>
            <th className="px-4 py-3 font-medium">Title</th>
            <th className="px-4 py-3 font-medium">Status</th>
            <th className="px-4 py-3 font-medium">Priority</th>
            <th className="px-4 py-3 font-medium">Created</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-[var(--color-card-border)] bg-[var(--color-card-bg)]">
          {items.map((item) => (
            <tr
              key={item.id}
              className="cursor-pointer hover:bg-[rgba(255,255,255,0.04)]"
              onClick={() => router.push(`/tasks/${item.key ?? item.id}`)}
            >
              <td className="px-4 py-3">
                <div className="text-xs font-semibold uppercase tracking-wide text-[var(--color-text-secondary)]">
                  {item.key ?? "—"}
                </div>
                <div className="text-white">{item.title}</div>
                <div className="mt-1 text-xs text-[var(--color-text-secondary)]">
                  {getDisplayName({
                    user: item.reporter ?? null,
                    fallbackName: item.requesterName ?? null,
                  })}
                </div>
              </td>
              <td className="px-4 py-3 text-[var(--color-text-secondary)]">
                {getStatusLabel(item.status)}
              </td>
              <td className="px-4 py-3">
                <Badge className={getPriorityClasses(item.priority)}>
                  {item.priority ?? "—"}
                </Badge>
              </td>
              <td className="px-4 py-3 text-[var(--color-text-secondary)]">
                {formatDate(item.createdAt)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
};

export default IssueTable;
