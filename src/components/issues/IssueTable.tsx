import React from "react";
import Badge from "../ui/Badge";
import { getPriorityClasses, getStatusLabel } from "./utils";

interface IssueTableItem {
  id: string;
  title: string;
  status?: string | null;
  priority?: string | null;
  createdAt?: Date | null;
}

interface IssueTableProps {
  items: IssueTableItem[];
}

const IssueTable: React.FC<IssueTableProps> = ({ items }) => {
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
            <tr key={item.id} className="hover:bg-[rgba(255,255,255,0.04)]">
              <td className="px-4 py-3 text-white">{item.title}</td>
              <td className="px-4 py-3 text-[var(--color-text-secondary)]">
                {getStatusLabel(item.status)}
              </td>
              <td className="px-4 py-3">
                <Badge className={getPriorityClasses(item.priority)}>
                  {item.priority ?? "—"}
                </Badge>
              </td>
              <td className="px-4 py-3 text-[var(--color-text-secondary)]">
                {item.createdAt ? item.createdAt.toLocaleDateString() : "—"}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
};

export default IssueTable;
