"use client";

import { createTaskForContactAction, toggleTaskAction } from "@/app/(app)/brokers/actions";
import { AddTaskButton } from "@/components/tasks/AddTaskButton";
import { TaskList } from "@/components/tasks/TaskList";
import type { CreateTask, TaskItem, ToggleTask } from "@/components/tasks/types";
import { SectionHeader } from "@/components/brokers/SectionHeader";

// This contact's tasks: the shared TaskList + an inline AddTask composer, both
// bound to this contact via the server actions.
export function ContactTasksSection({ contactId, tasks }: { contactId: string; tasks: TaskItem[] }) {
  const onToggle: ToggleTask = (id, completed) => toggleTaskAction(id, completed, contactId);
  const onCreate: CreateTask = (input) => createTaskForContactAction(contactId, input);

  return (
    <section className="mb-6">
      <SectionHeader title="Tasks" />
      {tasks.length > 0 ? (
        <div className="mb-2">
          <TaskList tasks={tasks} onToggle={onToggle} />
        </div>
      ) : (
        <div className="card mb-2 rounded-xl bg-card px-4 py-3">
          <p className="text-footnote text-label-3">No tasks yet.</p>
        </div>
      )}
      <AddTaskButton onCreate={onCreate} label="Add task" />
    </section>
  );
}
