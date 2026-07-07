"use client";

import { createTaskForContactAction, toggleTaskAction } from "@/app/(app)/brokers/actions";
import { deleteTaskAction } from "@/app/(app)/tasks/actions";
import { AddTaskButton } from "@/components/tasks/AddTaskButton";
import { CompletedTasks } from "@/components/tasks/CompletedTasks";
import { TaskList } from "@/components/tasks/TaskList";
import type { CreateTask, DeleteTask, TaskItem, ToggleTask } from "@/components/tasks/types";
import { SectionHeader } from "@/components/brokers/SectionHeader";

// This contact's tasks: open tasks + composer, with completed history behind
// a quiet disclosure (stored forever; reporting runs on completed_at). Every
// row carries the quiet "×" delete (inline confirm before it fires).
export function ContactTasksSection({ contactId, tasks }: { contactId: string; tasks: TaskItem[] }) {
  const onToggle: ToggleTask = (id, completed) => toggleTaskAction(id, completed, contactId);
  const onCreate: CreateTask = (input) => createTaskForContactAction(contactId, input);
  const onDelete: DeleteTask = (id) => deleteTaskAction(id, `/brokers/${contactId}`);

  const openTasks = tasks.filter((t) => !t.completed);
  const doneTasks = tasks.filter((t) => t.completed);

  return (
    <section className="mb-6">
      <SectionHeader title="Tasks" />
      {openTasks.length > 0 ? (
        <div className="mb-2">
          <TaskList tasks={openTasks} onToggle={onToggle} onDelete={onDelete} />
        </div>
      ) : (
        <div className="card mb-2 rounded-xl bg-card px-4 py-3">
          <p className="text-footnote text-label-3">No open tasks.</p>
        </div>
      )}
      <AddTaskButton onCreate={onCreate} label="Add task" />
      <CompletedTasks tasks={doneTasks} onToggle={onToggle} onDelete={onDelete} />
    </section>
  );
}
