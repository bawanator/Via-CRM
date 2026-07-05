"use client";

import type { ReactNode } from "react";
import { GroupedSection } from "@/components/ui/GroupedList";
import { TaskRow } from "@/components/tasks/TaskRow";
import type { TaskItem, ToggleTask } from "@/components/tasks/types";

// A grouped card of task rows. `onToggle(id, completed)` is a page-supplied
// action; this component binds each row's id. When there are no tasks it
// renders the `empty` slot (if given) so the caller controls the empty state.
export function TaskList({
  tasks,
  onToggle,
  hrefFor,
  header,
  footer,
  empty,
}: {
  tasks: TaskItem[];
  onToggle: ToggleTask;
  hrefFor?: (task: TaskItem) => string | undefined;
  header?: ReactNode;
  footer?: ReactNode;
  empty?: ReactNode;
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
        />
      ))}
    </GroupedSection>
  );
}
