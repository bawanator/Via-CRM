"use client";

import type { ReactNode } from "react";
import { GroupedSection } from "@/components/ui/GroupedList";
import { TaskRow } from "@/components/tasks/TaskRow";
import type { RenameTask, RescheduleTask, TaskItem, ToggleTask } from "@/components/tasks/types";

// A grouped card of task rows. `onToggle(id, completed)` is a page-supplied
// action; this component binds each row's id. When there are no tasks it
// renders the `empty` slot (if given) so the caller controls the empty state.
// `onRename` / `onReschedule` are optional — pages that pass them get inline
// title/due-date editing on every row; pages that don't are unchanged.
export function TaskList({
  tasks,
  onToggle,
  hrefFor,
  header,
  footer,
  empty,
  onRename,
  onReschedule,
}: {
  tasks: TaskItem[];
  onToggle: ToggleTask;
  hrefFor?: (task: TaskItem) => string | undefined;
  header?: ReactNode;
  footer?: ReactNode;
  empty?: ReactNode;
  onRename?: RenameTask;
  onReschedule?: RescheduleTask;
}) {
  if (tasks.length === 0) {
    return empty ? <>{empty}</> : null;
  }

  return (
    <GroupedSection header={header} footer={footer}>
      {tasks.map((task) => (
        <TaskRow
          key={task.id}
          task={task}
          onToggle={(completed) => onToggle(task.id, completed)}
          hrefForLink={hrefFor?.(task)}
          onRename={onRename ? (title) => onRename(task.id, title) : undefined}
          onReschedule={onReschedule ? (dueDate) => onReschedule(task.id, dueDate) : undefined}
        />
      ))}
    </GroupedSection>
  );
}
