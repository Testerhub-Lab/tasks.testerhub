import React from "react";
import Card from "../../components/ui/Card";
import Button from "../../components/ui/Button";
import { getLatestTasks } from "../../server/queries/tasks";

export const dynamic = "force-dynamic";

const TasksPage = async () => {
  const tasks = await getLatestTasks();

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h1 className="text-3xl font-bold">Список задач</h1>
        <Button variant="primary">Создать задачу</Button>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {tasks.map((task) => (
          <Card key={task.id}>
            <h3 className="text-lg font-semibold">{task.title}</h3>
            <p className="text-sm text-[var(--color-text-secondary)]">
              {task.description || "Описание отсутствует"}
            </p>
          </Card>
        ))}
      </div>
    </div>
  );
};

export default TasksPage;
