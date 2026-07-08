"use client";

import Link from "next/link";
import { useEffect, useRef, useState, useTransition } from "react";
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
//
// When `onDelete` is provided, a quiet "×" sits at the row end; the first tap
// turns it into an explicit "Delete?" confirm before anything fires.
export function TaskRow({
  task,
  onToggle,
  hrefForLink,
  onRename,
  onReschedule,
  onDelete,
}: {
  task: TaskItem;
  onToggle: (completed: boolean) => Promise<TaskActionResult>;
  hrefForLink?: string;
  onRename?: (title: string) => Promise<TaskActionResult>;
  onReschedule?: (dueDate: string | null) => Promise<TaskActionResult>;
  onDelete?: () => Promise<TaskActionResult>;
}) {
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const [deleteConfirm, setDeleteConfirm] = useState(false);

  function handleDelete() {
    if (!onDelete) return;
    setError(null);
    startTransition(async () => {
      const res = await onDelete();
      if (!res.ok) {
        setDeleteConfirm(false);
        setError(res.error ?? "Couldn’t delete this task.");
      }
    });
  }

  // --- title editing (shares the Inline* state machine from common) ---------
  const titleEdit = useInlineEdit(task.title, onRename ?? (async () => ({ ok: true })));
  const [titleDraft, setTitleDraft] = useState(task.title);
  const titleRef = useRef<HTMLInputElement>(null);
  const titleCancelRef = useRef(false);

  // --- due-date editing ------------------------------------------------------
  // The chip has an invisible native <input type="date"> stretched over it, so
  // ONE tap opens the OS date picker (the old two-step swap-in field never
  // opened iOS's picker — it just sat there looking dead). iOS fires `change`
  // on every wheel tick, so saves are debounced and flushed on blur; the
  // lastSent ref stops the blur flush double-writing what change already saved.
  const committedDue = task.due_date ?? "";
  const dueEdit = useInlineEdit(committedDue, async (next) =>
    onReschedule ? onReschedule(next === "" ? null : next) : { ok: true },
  );
  const dueTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const dueLastSentRef = useRef(committedDue);
  useEffect(() => {
    dueLastSentRef.current = committedDue;
  }, [committedDue]);
  function sendDue(next: string) {
    if (dueTimerRef.current) clearTimeout(dueTimerRef.current);
    if (next === dueLastSentRef.current) return;
    dueLastSentRef.current = next;
    dueEdit.save(next);
  }
  function scheduleDue(next: string) {
    if (dueTimerRef.current) clearTimeout(dueTimerRef.current);
    dueTimerRef.current = setTimeout(() => sendDue(next), 600);
  }

  // Optimistic completion: the circle fills (and the title strikes through)
  // the moment it's tapped, holds for a beat so the state change is seen,
  // and only then does the server write + refresh remove the row from
  // open-task lists. Failures roll the visual back.
  const [optimisticDone, setOptimisticDone] = useState<boolean | null>(null);
  const shownCompleted = optimisticDone ?? task.completed;

  function toggle() {
    setError(null);
    const next = !shownCompleted;
    setOptimisticDone(next);
    startTransition(async () => {
      if (next) await new Promise((resolve) => setTimeout(resolve, 550));
      const res = await onToggle(next);
      if (!res.ok) {
        setOptimisticDone(null);
        setError(res.error ?? "Couldn’t update this task.");
      }
    });
  }

  const due = task.due_date;
  // Overdue or due today → urgent (red), unless the task is already done.
  const urgent = due != null && !shownCompleted && daysBetween(todayISO(), due) <= 0;

  const titleClasses = `text-body truncate ${shownCompleted ? "text-label-3 line-through" : "text-label"}`;

  return (
    <div className="flex items-center gap-3 px-3 py-1.5">
      <button
        type="button"
        onClick={toggle}
        disabled={pending}
        aria-pressed={shownCompleted}
        aria-label={shownCompleted ? "Mark task not done" : "Mark task done"}
        className="pressable -ml-1.5 flex min-h-11 min-w-11 shrink-0 items-center justify-center rounded-full focus-visible:outline-2 focus-visible:outline-blue disabled:opacity-50"
      >
        {shownCompleted ? (
          <svg viewBox="0 0 24 24" className="h-5 w-5 text-green [animation:pop-in_0.2s_ease]" aria-hidden>
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

      {onReschedule ? (
        <span className="flex shrink-0 items-center">
          <span
            className={`text-caption-1 relative inline-flex min-h-7 items-center whitespace-nowrap rounded-full px-2 py-0.5 font-medium transition-colors hover:bg-fill-2 ${
              urgent ? "bg-red/10 text-red" : "text-label-3"
            } ${dueEdit.pending ? "opacity-50" : ""}`}
          >
            {due ? relativeDays(due) : "Set date"}
            <input
              type="date"
              // Remount on server confirm so the field tracks outside changes.
              key={committedDue}
              defaultValue={committedDue}
              disabled={dueEdit.pending}
              aria-label={due ? `Change due date (${relativeDays(due)})` : "Set due date"}
              onClick={(e) => {
                try {
                  e.currentTarget.showPicker?.();
                } catch {
                  /* browsers without showPicker still focus the field */
                }
              }}
              onChange={(e) => scheduleDue(e.target.value)}
              onBlur={(e) => sendDue(e.target.value)}
              className="absolute inset-0 h-full w-full cursor-pointer opacity-0 focus-visible:outline-2 focus-visible:outline-blue"
            />
          </span>
          {due ? (
            <button
              type="button"
              aria-label="Clear due date"
              onClick={() => sendDue("")}
              disabled={dueEdit.pending}
              className="pressable flex min-h-7 min-w-7 items-center justify-center rounded-full text-label-3 hover:text-red disabled:opacity-40"
            >
              <svg viewBox="0 0 24 24" className="h-3 w-3" aria-hidden>
                <path d="M7 7l10 10M17 7L7 17" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
              </svg>
            </button>
          ) : null}
        </span>
      ) : due ? (
        <span
          className={`text-caption-1 shrink-0 whitespace-nowrap rounded-full px-2 py-0.5 font-medium ${
            urgent ? "bg-red/10 text-red" : "text-label-3"
          }`}
        >
          {relativeDays(due)}
        </span>
      ) : null}

      {onDelete ? (
        deleteConfirm ? (
          <button
            type="button"
            onClick={handleDelete}
            onBlur={() => setDeleteConfirm(false)}
            disabled={pending}
            aria-label={`Confirm delete task “${task.title}”`}
            className="text-caption-1 pressable flex min-h-11 shrink-0 items-center whitespace-nowrap rounded-full px-2 font-semibold text-red focus-visible:outline-2 focus-visible:outline-blue disabled:opacity-40"
          >
            Delete?
          </button>
        ) : (
          <button
            type="button"
            onClick={() => setDeleteConfirm(true)}
            disabled={pending}
            aria-label="Delete task"
            className="pressable -mr-1.5 flex min-h-11 min-w-11 shrink-0 items-center justify-center rounded-full text-label-3 transition-colors hover:text-red focus-visible:outline-2 focus-visible:outline-blue disabled:opacity-40"
          >
            <svg viewBox="0 0 24 24" className="h-4 w-4" aria-hidden>
              <path
                d="M7 7l10 10M17 7L7 17"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.8"
                strokeLinecap="round"
              />
            </svg>
          </button>
        )
      ) : null}
    </div>
  );
}
