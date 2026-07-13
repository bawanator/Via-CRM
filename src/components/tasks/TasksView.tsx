"use client";

import { TaskList } from "@/components/tasks/TaskList";
import { AddTaskForm } from "@/components/tasks/AddTaskForm";
import { CompletedTasks } from "@/components/tasks/CompletedTasks";
import { EmptyState } from "@/components/ui/EmptyState";
import type { MentionOption, TaskItem } from "@/components/tasks/types";
import { createTaskAction, deleteTaskAction, toggleTaskAction, updateTaskAction } from "@/app/(app)/tasks/actions";

export type TaskGroup = { header: string; tasks: TaskItem[] };

// The full task book: composer on top, every open task in date groups
// (Overdue / Today / Upcoming / No date), completed history behind the usual
// disclosure. Same inline editing as the Today list.
export function TasksView({
  groups,
  completed,
  hrefById,
  mentionOptions,
}: {
  groups: TaskGroup[];
  completed: TaskItem[];
  hrefById: Record<string, string>;
  mentionOptions?: MentionOption[];
}) {
  const openCount = groups.reduce((n, g) => n + g.tasks.length, 0);
  return (
    <div>
      <AddTaskForm onCreate={createTaskAction} className="mb-5" mentionOptions={mentionOptions} />
      {openCount === 0 ? (
        <EmptyState title="No open tasks" hint="Anything you add here also syncs to Google Tasks." />
      ) : (
        groups.map((group) =>
          group.tasks.length > 0 ? (
            <TaskList
              key={group.header}
              header={group.header}
              tasks={group.tasks}
              onToggle={toggleTaskAction}
              hrefFor={(t) => hrefById[t.id]}
              onRename={(id, title) => updateTaskAction(id, { title })}
              onReschedule={(id, dueDate) => updateTaskAction(id, { due_date: dueDate })}
              onDelete={(id) => deleteTaskAction(id)}
            />
          ) : null,
        )
      )}
      <CompletedTasks tasks={completed} onToggle={toggleTaskAction} onDelete={(id) => deleteTaskAction(id)} />
    </div>
  );
}
