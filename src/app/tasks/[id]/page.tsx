import React from "react";
import { notFound } from "next/navigation";
import Card from "../../../components/ui/Card";
import Badge from "../../../components/ui/Badge";
import Button from "../../../components/ui/Button";
import { getTaskById } from "../../../server/queries/tasks";

export const dynamic = "force-dynamic";

interface TaskPageProps {
  params: { id: string };
}

const TaskPage = async ({ params }: TaskPageProps) => {
  const task = await getTaskById(params.id);

  if (!task) {
    return notFound();
  }

  return (
    <div className="space-y-6">
      <Card>
        <h1 className="text-3xl font-bold mb-4">{task.title}</h1>
        <Badge className="mb-2">{task.priority}</Badge>
        <p className="text-lg mb-4">{task.description || "Описание отсутствует"}</p>
        {task.tags.length > 0 && (
          <p className="text-sm text-[var(--color-text-secondary)] mb-4">
            Теги: {task.tags.join(", ")}
          </p>
        )}
        {task.dueDate && (
          <p className="text-sm text-[var(--color-text-secondary)] mb-4">
            Дедлайн: {new Date(task.dueDate).toLocaleDateString()}
          </p>
        )}
        {task.requesterName && (
          <p className="text-sm text-[var(--color-text-secondary)] mb-4">
            Заказчик: {task.requesterName}
          </p>
        )}
        {task.requesterEmail && (
          <p className="text-sm text-[var(--color-text-secondary)] mb-4">
            Email заказчика: {task.requesterEmail}
          </p>
        )}
        {task.attachments && task.attachments.length > 0 && (
          <div className="text-sm text-[var(--color-text-secondary)] mb-4">
            <div className="font-medium text-white mb-2">Вложения</div>
            <ul className="space-y-1">
              {task.attachments.map((file) => (
                <li key={file}>
                  <a
                    href={file}
                    className="text-[var(--color-primary)] hover:underline"
                    target="_blank"
                    rel="noreferrer"
                  >
                    {file.split("/").pop()}
                  </a>
                </li>
              ))}
            </ul>
          </div>
        )}
      </Card>
      <Button variant="primary">
        Создать новую задачу
      </Button>
    </div>
  );
};

export default TaskPage;
