"use client";

import { addDealTaskAction, toggleDealTaskAction } from "@/app/(app)/deals/actions";
import { deleteTaskAction } from "@/app/(app)/tasks/actions";
import { AddTaskButton } from "@/components/tasks/AddTaskButton";
import { CompletedTasks } from "@/components/tasks/CompletedTasks";
import { TaskList } from "@/components/tasks/TaskList";
import type { CreateTask, DeleteTask, TaskItem, ToggleTask } from "@/components/tasks/types";

// This deal's tasks: open tasks + composer, with completed history behind a
// quiet disclosure (stored forever; reporting runs on completed_at). Every row
// carries the quiet "×" delete (inline confirm before it fires).
export function DealTasksSection({ dealId, tasks }: { dealId: string; tasks: TaskItem[] }) {
  const onToggle: ToggleTask = (id, completed) => toggleDealTaskAction(dealId, id, completed);
  const onCreate: CreateTask = (input) => addDealTaskAction(dealId, input);
  const onDelete: DeleteTask = (id) => deleteTaskAction(id, `/deals/${dealId}`);

  const openTasks = tasks.filter((t) => !t.completed);
  const doneTasks = tasks.filter((t) => t.completed);

  return (
    <section className="mb-6">
      <h2 className="micro-label mb-1.5 px-3">Tasks</h2>
      <TaskList tasks={openTasks} onToggle={onToggle} onDelete={onDelete} empty={null} />
      <AddTaskButton onCreate={onCreate} label="Add task" className={openTasks.length > 0 ? "mt-2" : ""} />
      <CompletedTasks tasks={doneTasks} onToggle={onToggle} onDelete={onDelete} />
    </section>
  );
}
