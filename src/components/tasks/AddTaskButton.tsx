"use client";

import { useState } from "react";
import { PlusIcon } from "@/components/ui/icons";
import { AddTaskForm } from "@/components/tasks/AddTaskForm";
import type { CreateTask } from "@/components/tasks/types";

// A collapsed "Add task" affordance that expands into the inline composer, then
// collapses again after a task is added or cancelled (Esc). Use where a
// persistent composer would be too heavy (e.g. under a task list).
export function AddTaskButton({
  onCreate,
  label = "Add task",
  className = "",
}: {
  onCreate: CreateTask;
  label?: string;
  className?: string;
}) {
  const [open, setOpen] = useState(false);

  if (open) {
    return <AddTaskForm onCreate={onCreate} autoFocus onDone={() => setOpen(false)} className={className} />;
  }

  return (
    <button
      type="button"
      onClick={() => setOpen(true)}
      className={`card pressable flex min-h-11 w-full items-center gap-2 rounded-xl bg-card px-4 text-blue transition-colors hover:bg-fill-2 focus-visible:outline-2 focus-visible:outline-blue ${className}`}
    >
      <PlusIcon className="h-5 w-5" />
      <span className="text-body">{label}</span>
    </button>
  );
}
