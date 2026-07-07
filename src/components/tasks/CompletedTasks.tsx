"use client";

import { useState } from "react";
import { formatDate } from "@/lib/format";
import { TaskList } from "@/components/tasks/TaskList";
import type { DeleteTask, TaskItem, ToggleTask } from "@/components/tasks/types";

// Completed tasks stay out of the way behind a quiet disclosure — stored
// forever (reporting runs on completed_at), visible on demand, and a tap on
// the filled circle reopens one. `onDelete` (optional) passes straight through
// to the rows.
export function CompletedTasks({
  tasks,
  onToggle,
  onDelete,
}: {
  tasks: TaskItem[];
  onToggle: ToggleTask;
  onDelete?: DeleteTask;
}) {
  const [open, setOpen] = useState(false);
  if (tasks.length === 0) return null;

  const withDates = tasks.map((t) => ({
    ...t,
    subtitle: t.completed_at ? `Completed ${formatDate(t.completed_at)}` : t.subtitle,
  }));

  return (
    <div className="mt-1.5">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className="text-caption-1 pressable control-h -mx-1 rounded-md px-1 font-medium text-label-3 focus-visible:outline-2 focus-visible:outline-blue"
      >
        {open ? "Hide completed" : `Completed (${tasks.length})`}
      </button>
      {open ? (
        <div className="mt-1">
          <TaskList tasks={withDates} onToggle={onToggle} onDelete={onDelete} />
        </div>
      ) : null}
    </div>
  );
}
