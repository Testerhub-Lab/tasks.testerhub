import React from "react";
import IssueCard from "../../components/issues/IssueCard";
import CreateIssueButton from "../../components/issues/CreateIssueButton";
import { getAllTasks } from "../../server/queries/tasks";

const statusColumns = [
  { key: "new", title: "New", matches: ["new", "open", "todo", "backlog"] },
  { key: "in_progress", title: "In Progress", matches: ["in_progress", "progress"] },
  { key: "testing", title: "Testing", matches: ["testing", "qa", "review"] },
  { key: "done", title: "Done", matches: ["done", "closed", "resolved"] },
];

const normalizeStatus = (status?: string | null) =>
  status?.toLowerCase().replace(/\s+/g, "_") ?? "new";

const mapStatusToColumn = (status?: string | null) => {
  const normalized = normalizeStatus(status);
  const column = statusColumns.find((item) => item.matches.includes(normalized));
  return column?.key ?? "new";
};

const BoardPage = async () => {
  const tasks = await getAllTasks();
  const columns = statusColumns.reduce<Record<string, typeof tasks>>(
    (acc, column) => {
      acc[column.key] = [];
      return acc;
    },
    {}
  );

  tasks.forEach((task) => {
    const columnKey = mapStatusToColumn(task.status);
    columns[columnKey].push(task);
  });

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-3xl font-semibold">Board</h1>
          <p className="text-sm text-[var(--color-text-secondary)]">
            Канбан-представление для ежедневной работы.
          </p>
        </div>
      </div>
      {tasks.length === 0 ? (
        <div className="rounded-2xl border border-[var(--color-card-border)] bg-[var(--color-card-bg)] p-8 text-center">
          <p className="text-lg text-white">No tasks yet</p>
          <p className="mt-2 text-sm text-[var(--color-text-secondary)]">
            Создайте первый тикет, чтобы начать работу.
          </p>
          <div className="mt-4 flex justify-center">
            <CreateIssueButton />
          </div>
        </div>
      ) : (
        <div className="grid gap-6 lg:grid-cols-4">
          {statusColumns.map((column) => (
            <div key={column.key} className="space-y-4">
              <div className="flex items-center justify-between">
                <h2 className="text-sm font-semibold uppercase tracking-wide text-[var(--color-text-secondary)]">
                  {column.title}
                </h2>
                <span className="text-xs text-[var(--color-text-secondary)]">
                  {columns[column.key].length}
                </span>
              </div>
              <div className="space-y-4">
                {columns[column.key].map((task) => (
                  <IssueCard
                    key={task.id}
                    title={task.title}
                    description={task.description}
                    priority={task.priority}
                    status={task.status}
                  />
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default BoardPage;
