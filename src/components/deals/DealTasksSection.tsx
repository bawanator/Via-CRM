"use client";

import { addDealTaskAction, toggleDealTaskAction } from "@/app/(app)/deals/actions";
import { AddTaskButton } from "@/components/tasks/AddTaskButton";
import { TaskList } from "@/components/tasks/TaskList";
import type { CreateTask, TaskItem, ToggleTask } from "@/components/tasks/types";

// This deal's tasks: the shared TaskList for display + the inline composer.
export function DealTasksSection({ dealId, tasks }: { dealId: string; tasks: TaskItem[] }) {
  const onToggle: ToggleTask = (id, completed) => toggleDealTaskAction(dealId, id, completed);
  const onCreate: CreateTask = (input) => addDealTaskAction(dealId, input);

  return (
    <section className="mb-6">
      <h2 className="text-footnote mb-1.5 px-4 uppercase tracking-wide text-label-2">Tasks</h2>
      <TaskList tasks={tasks} onToggle={onToggle} empty={null} />
      <AddTaskButton onCreate={onCreate} label="Add task" className={tasks.length > 0 ? "mt-2" : ""} />
    </section>
  );
}
