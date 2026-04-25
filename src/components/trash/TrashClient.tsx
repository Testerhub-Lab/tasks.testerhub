"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Button from "@/components/ui/Button";
import Card from "@/components/ui/Card";
import { restoreTaskAction } from "@/server/actions/tasks";
import { formatDate } from "@/components/issues/utils";

type TrashTask = {
  id: string;
  key: string;
  title: string;
  projectName: string;
  status: string;
  deletedAt: Date | null;
  canRestore: boolean;
};

interface TrashClientProps {
  tasks: TrashTask[];
}

const TrashClient = ({ tasks }: TrashClientProps) => {
  const router = useRouter();
  const [busyId, setBusyId] = useState<string | null>(null);
  const [items, setItems] = useState<TrashTask[]>(tasks);

  const handleRestore = async (taskId: string) => {
    setBusyId(taskId);
    try {
      const result = await restoreTaskAction(taskId);
      if (!result.ok) return;
      setItems((prev) => prev.filter((task) => task.id !== taskId));
      router.refresh();
    } finally {
      setBusyId(null);
    }
  };

  if (items.length === 0) {
    return (
      <Card className="p-6 text-sm text-white/70">
        Корзина пуста.
      </Card>
    );
  }

  return (
    <Card className="overflow-hidden p-0">
      <table className="w-full text-left text-sm">
        <thead className="bg-white/[0.04] text-white/65">
          <tr>
            <th className="px-4 py-3 font-medium">Задача</th>
            <th className="px-4 py-3 font-medium">Проект</th>
            <th className="px-4 py-3 font-medium">Удалена</th>
            <th className="px-4 py-3 font-medium text-right">Действие</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-white/10">
          {items.map((task) => (
            <tr key={task.id}>
              <td className="px-4 py-3">
                <div className="text-xs uppercase tracking-wide text-white/50">{task.key}</div>
                <div className="text-white">{task.title}</div>
                <div className="text-xs text-white/45">Status: {task.status}</div>
              </td>
              <td className="px-4 py-3 text-white/70">{task.projectName}</td>
              <td className="px-4 py-3 text-white/60">
                {task.deletedAt ? formatDate(task.deletedAt) : "—"}
              </td>
              <td className="px-4 py-3 text-right">
                {task.canRestore ? (
                  <Button
                    variant="secondary"
                    disabled={busyId === task.id}
                    onClick={() => void handleRestore(task.id)}
                  >
                    {busyId === task.id ? "Восстанавливаем..." : "Восстановить"}
                  </Button>
                ) : (
                  <span className="text-xs text-white/45">Нет прав</span>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </Card>
  );
};

export default TrashClient;
