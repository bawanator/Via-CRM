"use client";

import { addDealTaskAction, toggleDealTaskAction } from "@/app/(app)/deals/actions";
import { AddTaskButton } from "@/components/tasks/AddTaskButton";
import { CompletedTasks } from "@/components/tasks/CompletedTasks";
import { TaskList } from "@/components/tasks/TaskList";
import type { CreateTask, TaskItem, ToggleTask } from "@/components/tasks/types";

// This deal's tasks: open tasks + composer, with completed history behind a
// quiet disclosure (stored forever; reporting runs on completed_at).
export function DealTasksSection({ dealId, tasks }: { dealId: string; tasks: TaskItem[] }) {
  const onToggle: ToggleTask = (id, completed) => toggleDealTaskAction(dealId, id, completed);
  const onCreate: CreateTask = (input) => addDealTaskAction(dealId, input);

  const openTasks = tasks.filter((t) => !t.completed);
  const doneTasks = tasks.filter((t) => t.completed);

  return (
    <section className="mb-6">
      <h2 className="text-caption-1 mb-1.5 px-3 uppercase tracking-wide text-label-2">Tasks</h2>
      <TaskList tasks={openTasks} onToggle={onToggle} empty={null} />
      <AddTaskButton onCreate={onCreate} label="Add task" className={openTasks.length > 0 ? "mt-2" : ""} />
      <CompletedTasks tasks={doneTasks} onToggle={onToggle} />
    </section>
  );
}
