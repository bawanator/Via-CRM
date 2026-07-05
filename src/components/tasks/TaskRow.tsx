"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { daysBetween, todayISO } from "@/lib/dates";
import { relativeDays } from "@/lib/format";
import type { TaskActionResult, TaskItem } from "@/components/tasks/types";

// A single clean task row: a tappable completion circle, the title (struck
// through + muted once done), a due-date chip (red when overdue/today), and an
// optional subtitle that links to the related contact or deal.
export function TaskRow({
  task,
  onToggle,
  hrefForLink,
}: {
  task: TaskItem;
  onToggle: (completed: boolean) => Promise<TaskActionResult>;
  hrefForLink?: string;
}) {
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function toggle() {
    setError(null);
    startTransition(async () => {
      const res = await onToggle(!task.completed);
      if (!res.ok) setError(res.error ?? "Couldn’t update this task.");
    });
  }

  const due = task.due_date;
  // Overdue or due today → urgent (red), unless the task is already done.
  const urgent = due != null && !task.completed && daysBetween(todayISO(), due) <= 0;

  return (
    <div className="flex items-center gap-3 px-4 py-2.5">
      <button
        type="button"
        onClick={toggle}
        disabled={pending}
        aria-pressed={task.completed}
        aria-label={task.completed ? "Mark task not done" : "Mark task done"}
        className="pressable -ml-1.5 flex min-h-11 min-w-11 shrink-0 items-center justify-center rounded-full focus-visible:outline-2 focus-visible:outline-blue disabled:opacity-50"
      >
        {task.completed ? (
          <svg viewBox="0 0 24 24" className="h-6 w-6 text-green" aria-hidden>
            <circle cx="12" cy="12" r="9" fill="currentColor" />
            <path
              d="M8.4 12.3l2.3 2.3 4.5-4.8"
              fill="none"
              stroke="#fff"
              strokeWidth="1.9"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        ) : (
          <svg viewBox="0 0 24 24" className="h-6 w-6 text-label-3" aria-hidden>
            <circle cx="12" cy="12" r="9" fill="none" stroke="currentColor" strokeWidth="1.6" />
          </svg>
        )}
      </button>

      <div className="min-w-0 flex-1">
        <p className={`text-body truncate ${task.completed ? "text-label-3 line-through" : "text-label"}`}>
          {task.title}
        </p>
        {task.subtitle ? (
          hrefForLink ? (
            <Link href={hrefForLink} className="text-footnote pressable block truncate text-blue">
              {task.subtitle}
            </Link>
          ) : (
            <p className="text-footnote truncate text-label-2">{task.subtitle}</p>
          )
        ) : null}
        {error ? <p className="text-footnote text-red">{error}</p> : null}
      </div>

      {due ? (
        <span
          className={`text-caption-1 shrink-0 whitespace-nowrap rounded-full px-2 py-0.5 font-medium ${
            urgent ? "bg-red/10 text-red" : "text-label-3"
          }`}
        >
          {relativeDays(due)}
        </span>
      ) : null}
    </div>
  );
}
