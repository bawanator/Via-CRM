"use client";

import { useMemo, useRef, useState, useTransition } from "react";
import { Button } from "@/components/ui/Button";
import type { CreateTask, MentionOption } from "@/components/tasks/types";

// Compact inline task composer: a title field with an optional due date and an
// Add button, styled to sit inside a task list. Presentational — the owning
// page passes `onCreate` (a server action that revalidates). On success the
// fields clear and the route refreshes; `onDone` lets a wrapper collapse it.
//
// Type "@" to link the task to a broker: an autocomplete menu appears, and
// picking a broker drops their name into the title and files the task under
// them (contact_id). `mentionOptions` is optional — without it the "@" is just
// a plain character (contact/deal task lists that are already linked pass none).
export function AddTaskForm({
  onCreate,
  placeholder = "Add a task…",
  autoFocus = false,
  onDone,
  className = "",
  mentionOptions,
}: {
  onCreate: CreateTask;
  placeholder?: string;
  autoFocus?: boolean;
  onDone?: () => void;
  className?: string;
  mentionOptions?: MentionOption[];
}) {
  const titleRef = useRef<HTMLInputElement>(null);
  const [title, setTitle] = useState("");
  const [due, setDue] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  // The broker this task will be filed under, chosen via "@". Cleared with the
  // chip's ×; re-picking replaces it.
  const [linked, setLinked] = useState<MentionOption | null>(null);
  // The live "@query" (text after the last "@" up to the caret), or null when
  // no mention is being typed. Drives the autocomplete menu.
  const [query, setQuery] = useState<string | null>(null);
  const [highlight, setHighlight] = useState(0);

  const canMention = !!mentionOptions && mentionOptions.length > 0;

  const matches = useMemo(() => {
    if (query === null || !mentionOptions) return [];
    const q = query.trim().toLowerCase();
    const pool = q ? mentionOptions.filter((o) => o.full_name.toLowerCase().includes(q)) : mentionOptions;
    return pool.slice(0, 6);
  }, [query, mentionOptions]);

  const menuOpen = canMention && query !== null && matches.length > 0;

  // Find an active "@token" immediately before the caret: the last "@" with no
  // whitespace after it. Returns the query text and the "@" index, or null.
  function activeMention(value: string, caret: number): { at: number; text: string } | null {
    const upto = value.slice(0, caret);
    const at = upto.lastIndexOf("@");
    if (at === -1) return null;
    // A mention starts at the string start or right after whitespace.
    if (at > 0 && !/\s/.test(upto[at - 1])) return null;
    const text = upto.slice(at + 1);
    if (/\s/.test(text)) return null; // whitespace ends the mention
    return { at, text };
  }

  function onTitleChange(e: React.ChangeEvent<HTMLInputElement>) {
    const value = e.target.value;
    setTitle(value);
    if (!canMention) return;
    const caret = e.target.selectionStart ?? value.length;
    const active = activeMention(value, caret);
    setQuery(active ? active.text : null);
    setHighlight(0);
  }

  function pick(option: MentionOption) {
    const el = titleRef.current;
    const caret = el?.selectionStart ?? title.length;
    const active = activeMention(title, caret);
    if (active) {
      // Replace "@query" with the broker's name so the title reads naturally.
      const before = title.slice(0, active.at);
      const after = title.slice(caret);
      const insert = `${option.full_name} `;
      const next = `${before}${insert}${after}`;
      setTitle(next);
      // Restore the caret just after the inserted name.
      const pos = before.length + insert.length;
      requestAnimationFrame(() => {
        el?.focus();
        el?.setSelectionRange(pos, pos);
      });
    } else if (!title.trim()) {
      setTitle(`${option.full_name} `);
    }
    setLinked(option);
    setQuery(null);
  }

  function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const trimmed = title.trim();
    if (!trimmed) {
      setError("Give the task a title.");
      titleRef.current?.focus();
      return;
    }
    startTransition(async () => {
      const res = await onCreate({ title: trimmed, due_date: due || null, contact_id: linked?.id ?? null });
      if (res.ok) {
        setTitle("");
        setDue("");
        setLinked(null);
        setQuery(null);
        setError(null);
        onDone?.();
      } else {
        setError(res.error ?? "Couldn’t add the task.");
      }
    });
  }

  function onTitleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (menuOpen) {
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setHighlight((h) => (h + 1) % matches.length);
        return;
      }
      if (e.key === "ArrowUp") {
        e.preventDefault();
        setHighlight((h) => (h - 1 + matches.length) % matches.length);
        return;
      }
      if (e.key === "Enter" || e.key === "Tab") {
        e.preventDefault();
        pick(matches[highlight]);
        return;
      }
      if (e.key === "Escape") {
        e.preventDefault();
        setQuery(null);
        return;
      }
    }
    if (e.key === "Escape" && onDone) {
      e.preventDefault();
      onDone();
    }
  }

  return (
    <form onSubmit={submit} className={`card overflow-hidden rounded-xl bg-card ${className}`}>
      <div className="relative flex items-center gap-2 px-3 py-1">
        <svg viewBox="0 0 24 24" className="h-5 w-5 shrink-0 text-label-3" aria-hidden>
          <circle cx="12" cy="12" r="9" fill="none" stroke="currentColor" strokeWidth="1.6" strokeDasharray="2.5 2.5" />
        </svg>
        <input
          ref={titleRef}
          autoFocus={autoFocus}
          value={title}
          onChange={onTitleChange}
          onKeyDown={onTitleKeyDown}
          placeholder={placeholder}
          aria-label="Task title"
          autoComplete="off"
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

        {menuOpen ? (
          <ul
            role="listbox"
            aria-label="Link to broker"
            className="card absolute left-9 top-full z-20 mt-1 w-64 overflow-hidden rounded-xl bg-card py-1 shadow-lg ring-1 ring-separator"
          >
            {matches.map((option, i) => (
              <li key={option.id}>
                <button
                  type="button"
                  role="option"
                  aria-selected={i === highlight}
                  // pointerDown (not click) fires before the input blur closes the menu.
                  onPointerDown={(ev) => {
                    ev.preventDefault();
                    pick(option);
                  }}
                  onMouseEnter={() => setHighlight(i)}
                  className={`text-body flex w-full items-center gap-2 px-3 py-1.5 text-left ${
                    i === highlight ? "bg-fill-2 text-label" : "text-label-2"
                  }`}
                >
                  <span className="text-label-3">@</span>
                  <span className="truncate">{option.full_name}</span>
                </button>
              </li>
            ))}
          </ul>
        ) : null}
      </div>

      {linked ? (
        <div className="flex items-center gap-1.5 px-3 pb-1.5">
          <span className="text-caption-1 inline-flex items-center gap-1 rounded-full bg-fill-2 px-2 py-0.5 text-label-2">
            Filed under {linked.full_name}
            <button
              type="button"
              aria-label={`Unlink ${linked.full_name}`}
              onClick={() => setLinked(null)}
              className="pressable -mr-0.5 rounded-full px-0.5 text-label-3 hover:text-label"
            >
              ×
            </button>
          </span>
        </div>
      ) : null}

      {error ? <p className="text-footnote px-3 pb-2 text-red">{error}</p> : null}
    </form>
  );
}
