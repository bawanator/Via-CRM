"use client";

import { TaskList } from "@/components/tasks/TaskList";
import { AddTaskForm } from "@/components/tasks/AddTaskForm";
import type { TaskItem } from "@/components/tasks/types";
import { createTaskAction, toggleTaskAction } from "@/app/(app)/tasks/actions";

// The day's to-do list, top of the Today screen: the open tasks (each with a
// completion circle that toggles via toggleTaskAction) plus a persistent quick
// composer wired to createTaskAction. The composer is always shown so the first
// task of the day is one tap away; the list only appears when there are tasks.
export function TodayTasks({ tasks, hrefById }: { tasks: TaskItem[]; hrefById: Record<string, string> }) {
  const hasTasks = tasks.length > 0;
  return (
    <div>
      <h2 className="text-footnote mb-1.5 px-4 uppercase tracking-wide text-label-2">Tasks</h2>
      <AddTaskForm onCreate={createTaskAction} className={hasTasks ? "mb-2" : "mb-6"} />
      {hasTasks ? (
        <TaskList tasks={tasks} onToggle={toggleTaskAction} hrefFor={(t) => hrefById[t.id]} />
      ) : null}
    </div>
  );
}
