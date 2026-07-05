"use client";

import Link from "next/link";
import { useRef, useState, useTransition } from "react";
import { daysBetween, todayISO } from "@/lib/dates";
import { relativeDays } from "@/lib/format";
import { useInlineEdit } from "@/components/common/useInlineEdit";
import type { TaskActionResult, TaskItem } from "@/components/tasks/types";

// A single clean task row: a tappable completion circle, the title (struck
// through + muted once done), a due-date chip (red when overdue/today), and an
// optional subtitle that links to the related contact or deal.
//
// When `onRename` / `onReschedule` are provided (e.g. on Today) the title and
// due chip become click-to-edit: the title turns into an inline input
// (Enter/blur saves, Esc cancels) and the chip opens a small date input with a
// Clear option that saves on change. Pages that omit them are unchanged.
export function TaskRow({
  task,
  onToggle,
  hrefForLink,
  onRename,
  onReschedule,
}: {
  task: TaskItem;
  onToggle: (completed: boolean) => Promise<TaskActionResult>;
  hrefForLink?: string;
  onRename?: (title: string) => Promise<TaskActionResult>;
  onReschedule?: (dueDate: string | null) => Promise<TaskActionResult>;
}) {
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  // --- title editing (shares the Inline* state machine from common) ---------
  const titleEdit = useInlineEdit(task.title, onRename ?? (async () => ({ ok: true })));
  const [titleDraft, setTitleDraft] = useState(task.title);
  const titleRef = useRef<HTMLInputElement>(null);
  const titleCancelRef = useRef(false);

  // --- due-date editing ------------------------------------------------------
  const committedDue = task.due_date ?? "";
  const dueEdit = useInlineEdit(committedDue, async (next) =>
    onReschedule ? onReschedule(next === "" ? null : next) : { ok: true },
  );

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

  const titleClasses = `text-body truncate ${task.completed ? "text-label-3 line-through" : "text-label"}`;

  return (
    <div className="flex items-center gap-3 px-3 py-1.5">
      <button
        type="button"
        onClick={toggle}
        disabled={pending}
        aria-pressed={task.completed}
        aria-label={task.completed ? "Mark task not done" : "Mark task done"}
        className="pressable -ml-1.5 flex min-h-11 min-w-11 shrink-0 items-center justify-center rounded-full focus-visible:outline-2 focus-visible:outline-blue disabled:opacity-50"
      >
        {task.completed ? (
          <svg viewBox="0 0 24 24" className="h-5 w-5 text-green" aria-hidden>
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
          <svg viewBox="0 0 24 24" className="h-5 w-5 text-label-3" aria-hidden>
            <circle cx="12" cy="12" r="9" fill="none" stroke="currentColor" strokeWidth="1.6" />
          </svg>
        )}
      </button>

      <div className="min-w-0 flex-1">
        {titleEdit.editing ? (
          <input
            ref={titleRef}
            autoFocus
            type="text"
            value={titleDraft}
            disabled={titleEdit.pending}
            aria-label="Task title"
            onChange={(e) => setTitleDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                titleRef.current?.blur();
              } else if (e.key === "Escape") {
                e.preventDefault();
                titleCancelRef.current = true;
                titleRef.current?.blur();
              }
            }}
            onBlur={() => {
              if (titleCancelRef.current) {
                titleCancelRef.current = false;
                titleEdit.stop();
                return;
              }
              const trimmed = titleDraft.trim();
              // An emptied title is a cancel, not a save — tasks need words.
              if (trimmed === "") titleEdit.stop();
              else titleEdit.save(trimmed);
            }}
            className="text-body w-full rounded-md bg-fill-2 px-1.5 -mx-1.5 text-label focus:outline-none focus-visible:outline-2 focus-visible:outline-blue disabled:opacity-60"
          />
        ) : onRename ? (
          <button
            type="button"
            onClick={() => {
              setTitleDraft(task.title);
              titleCancelRef.current = false;
              titleEdit.start();
            }}
            aria-label={`Rename task “${task.title}”`}
            className="block w-full rounded-md px-1.5 -mx-1.5 text-left transition-colors hover:bg-fill-2 focus-visible:outline-2 focus-visible:outline-blue"
          >
            <span className={`block ${titleClasses}`}>{task.title}</span>
          </button>
        ) : (
          <p className={titleClasses}>{task.title}</p>
        )}

        {task.subtitle ? (
          hrefForLink ? (
            <Link href={hrefForLink} className="text-caption-1 pressable block truncate text-blue">
              {task.subtitle}
            </Link>
          ) : (
            <p className="text-caption-1 truncate text-label-2">{task.subtitle}</p>
          )
        ) : null}
        {titleEdit.pending ? <p className="text-caption-1 text-label-3">Saving…</p> : null}
        {titleEdit.error ? <p className="text-footnote text-red">{titleEdit.error}</p> : null}
        {dueEdit.error ? <p className="text-footnote text-red">{dueEdit.error}</p> : null}
        {error ? <p className="text-footnote text-red">{error}</p> : null}
      </div>

      {dueEdit.editing ? (
        <span className="flex shrink-0 items-center gap-1">
          <input
            autoFocus
            type="date"
            defaultValue={committedDue}
            disabled={dueEdit.pending}
            aria-label="Due date"
            onChange={(e) => dueEdit.save(e.target.value)}
            onKeyDown={(e) => {
              // The date saves on change, so leaving the field (Esc or blur)
              // simply closes the editor without a write.
              if (e.key === "Escape") {
                e.preventDefault();
                (e.target as HTMLInputElement).blur();
              }
            }}
            onBlur={dueEdit.stop}
            className="text-footnote rounded-md bg-fill-2 px-1.5 py-0.5 text-label focus:outline-none focus-visible:outline-2 focus-visible:outline-blue disabled:opacity-60"
          />
          {due ? (
            <button
              type="button"
              aria-label="Clear due date"
              // pointerdown (not click) so the date input doesn't blur-close
              // this editor before the clear registers.
              onPointerDown={(e) => {
                e.preventDefault();
                dueEdit.save("");
              }}
              className="text-footnote pressable rounded-md px-1.5 py-0.5 text-red"
            >
              Clear
            </button>
          ) : null}
        </span>
      ) : due ? (
        onReschedule ? (
          <button
            type="button"
            onClick={dueEdit.start}
            aria-label={`Change due date (${relativeDays(due)})`}
            className={`text-caption-1 pressable shrink-0 whitespace-nowrap rounded-full px-2 py-0.5 font-medium transition-colors hover:bg-fill-2 focus-visible:outline-2 focus-visible:outline-blue ${
              urgent ? "bg-red/10 text-red" : "text-label-3"
            }`}
          >
            {relativeDays(due)}
          </button>
        ) : (
          <span
            className={`text-caption-1 shrink-0 whitespace-nowrap rounded-full px-2 py-0.5 font-medium ${
              urgent ? "bg-red/10 text-red" : "text-label-3"
            }`}
          >
            {relativeDays(due)}
          </span>
        )
      ) : onReschedule ? (
        <button
          type="button"
          onClick={dueEdit.start}
          aria-label="Set due date"
          className="text-caption-1 pressable shrink-0 whitespace-nowrap rounded-full px-2 py-0.5 font-medium text-label-3 transition-colors hover:bg-fill-2 focus-visible:outline-2 focus-visible:outline-blue"
        >
          Set date
        </button>
      ) : null}
    </div>
  );
}
