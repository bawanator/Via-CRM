"use client";

import { TaskList } from "@/components/tasks/TaskList";
import { AddTaskForm } from "@/components/tasks/AddTaskForm";
import type { TaskItem } from "@/components/tasks/types";
import { createTaskAction, toggleTaskAction, updateTaskAction } from "@/app/(app)/tasks/actions";

// The day's to-do list, top of the Today screen: the open tasks (each with a
// completion circle that toggles via toggleTaskAction) plus a persistent quick
// composer wired to createTaskAction. The composer is always shown so the first
// task of the day is one tap away; the list only appears when there are tasks.
// Rows are editable in place — title and due date save via updateTaskAction.
export function TodayTasks({ tasks, hrefById }: { tasks: TaskItem[]; hrefById: Record<string, string> }) {
  const hasTasks = tasks.length > 0;
  return (
    <div>
      <h2 className="text-caption-1 mb-1.5 px-3 uppercase tracking-wide text-label-2">Tasks</h2>
      <AddTaskForm onCreate={createTaskAction} className={hasTasks ? "mb-2" : "mb-5"} />
      {hasTasks ? (
        <TaskList
          tasks={tasks}
          onToggle={toggleTaskAction}
          hrefFor={(t) => hrefById[t.id]}
          onRename={(id, title) => updateTaskAction(id, { title })}
          onReschedule={(id, dueDate) => updateTaskAction(id, { due_date: dueDate })}
        />
      ) : null}
    </div>
  );
}
