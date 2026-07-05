// Shared, presentational task types. These are intentionally a small structural
// subset of TaskRow (plus a display-only `subtitle`) so any page can map its
// data — a raw TaskRow, or a task joined to a contact/deal — into the UI.

export type TaskActionResult = { ok: boolean; error?: string };

export type TaskItem = {
  id: string;
  title: string;
  due_date: string | null;
  completed: boolean;
  // Optional line under the title, e.g. the linked contact or deal name.
  subtitle?: string | null;
};

// Toggle one task's completion. Owning page supplies a non-throwing action.
export type ToggleTask = (id: string, completed: boolean) => Promise<TaskActionResult>;

// Create a task from the inline composer. Owning page supplies the action.
export type TaskCreateInput = { title: string; due_date: string | null };
export type CreateTask = (input: TaskCreateInput) => Promise<TaskActionResult>;
