import React from "react";
import IssueRow from "../../components/issues/IssueRow";
import CreateIssueButton from "../../components/issues/CreateIssueButton";
import { getAllTasks } from "../../server/queries/tasks";

const BacklogPage = async () => {
  const tasks = await getAllTasks();

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-3xl font-semibold">Backlog</h1>
          <p className="text-sm text-[var(--color-text-secondary)]">
            Список входящих задач и багов.
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
        <div className="space-y-4">
          {tasks.map((task) => (
            <IssueRow
              key={task.id}
              title={task.title}
              description={task.description}
              priority={task.priority}
              status={task.status}
              createdAt={task.createdAt}
            />
          ))}
        </div>
      )}
    </div>
  );
};

export default BacklogPage;
