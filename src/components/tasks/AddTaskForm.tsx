"use client";

import { useRef, useState, useTransition } from "react";
import { Button } from "@/components/ui/Button";
import type { CreateTask } from "@/components/tasks/types";

// Compact inline task composer: a title field with an optional due date and an
// Add button, styled to sit inside a task list. Presentational — the owning
// page passes `onCreate` (a server action that revalidates). On success the
// fields clear and the route refreshes; `onDone` lets a wrapper collapse it.
export function AddTaskForm({
  onCreate,
  placeholder = "Add a task…",
  autoFocus = false,
  onDone,
  className = "",
}: {
  onCreate: CreateTask;
  placeholder?: string;
  autoFocus?: boolean;
  onDone?: () => void;
  className?: string;
}) {
  const titleRef = useRef<HTMLInputElement>(null);
  const [title, setTitle] = useState("");
  const [due, setDue] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const trimmed = title.trim();
    if (!trimmed) {
      setError("Give the task a title.");
      titleRef.current?.focus();
      return;
    }
    startTransition(async () => {
      const res = await onCreate({ title: trimmed, due_date: due || null });
      if (res.ok) {
        setTitle("");
        setDue("");
        setError(null);
        onDone?.();
      } else {
        setError(res.error ?? "Couldn’t add the task.");
      }
    });
  }

  return (
    <form
      onSubmit={submit}
      className={`card overflow-hidden rounded-xl bg-card ${className}`}
    >
      <div className="flex items-center gap-2 px-3 py-1">
        <svg viewBox="0 0 24 24" className="h-5 w-5 shrink-0 text-label-3" aria-hidden>
          <circle cx="12" cy="12" r="9" fill="none" stroke="currentColor" strokeWidth="1.6" strokeDasharray="2.5 2.5" />
        </svg>
        <input
          ref={titleRef}
          autoFocus={autoFocus}
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Escape" && onDone) {
              e.preventDefault();
              onDone();
            }
          }}
          placeholder={placeholder}
          aria-label="Task title"
          className="text-body control-h w-full min-w-0 flex-1 bg-transparent text-label placeholder:text-label-3 focus:outline-none"
        />
        <input
          type="date"
          value={due}
          onChange={(e) => setDue(e.target.value)}
          aria-label="Due date"
          className="text-footnote control-h shrink-0 bg-transparent text-label-2 focus:outline-none focus-visible:outline-2 focus-visible:outline-blue"
        />
        <Button variant="tinted" type="submit" disabled={pending} className="shrink-0">
          {pending ? "Adding…" : "Add"}
        </Button>
      </div>
      {error ? <p className="text-footnote px-3 pb-2 text-red">{error}</p> : null}
    </form>
  );
}
