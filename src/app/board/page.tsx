import React from "react";
import CreateIssueButton from "../../components/issues/CreateIssueButton";
import BoardClient from "../../components/board/BoardClient";
import { getAllTasks } from "../../server/queries/tasks";

const BoardPage = async () => {
  const tasks = await getAllTasks();

  return (
    <div className="space-y-6">
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
        <BoardClient tasks={tasks} />
      )}
    </div>
  );
};

export default BoardPage;
