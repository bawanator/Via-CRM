"use client";

import { useEffect, useRef } from "react";
import { formatDate } from "@/lib/format";
import { useInlineEdit, type InlineSave } from "@/components/common/useInlineEdit";

// Click-to-edit date. The friendly formatted value has an invisible native
// <input type="date"> stretched over it, so ONE tap opens the OS picker —
// the old two-step swap-in field never opened iOS's picker. iOS fires
// `change` per wheel tick, so saves are debounced and flushed on blur; a
// small × clears the date (iOS pickers have no clear of their own).
// Commits the raw ISO (YYYY-MM-DD) or "" (cleared); onSave maps "" to null.
export function InlineDate({
  value,
  onSave,
  placeholder = "No date",
  ariaLabel,
  className = "",
}: {
  value: string | null;
  onSave: InlineSave;
  placeholder?: string;
  ariaLabel?: string;
  className?: string;
}) {
  const committed = value ?? "";
  const { error, pending, save } = useInlineEdit(committed, onSave);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastSentRef = useRef(committed);
  useEffect(() => {
    lastSentRef.current = committed;
  }, [committed]);

  function send(next: string) {
    if (timerRef.current) clearTimeout(timerRef.current);
    if (next === lastSentRef.current) return;
    lastSentRef.current = next;
    save(next);
  }
  function schedule(next: string) {
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => send(next), 600);
  }

  return (
    <div className={className}>
      <span className="flex items-center">
        <span
          className={`text-body control-h relative -mx-2 flex min-w-0 flex-1 items-center rounded-md px-2 transition-colors hover:bg-fill-2 ${
            pending ? "opacity-50" : ""
          }`}
        >
          {value ? (
            <span className="truncate text-label">{formatDate(value)}</span>
          ) : (
            <span className="truncate text-label-3">{placeholder}</span>
          )}
          <input
            type="date"
            key={committed}
            defaultValue={committed}
            disabled={pending}
            aria-label={ariaLabel}
            onClick={(e) => {
              try {
                e.currentTarget.showPicker?.();
              } catch {
                /* browsers without showPicker still focus the field */
              }
            }}
            onChange={(e) => schedule(e.target.value)}
            onBlur={(e) => send(e.target.value)}
            className="absolute inset-0 h-full w-full cursor-pointer opacity-0 focus-visible:outline-2 focus-visible:outline-blue"
          />
        </span>
        {value ? (
          <button
            type="button"
            aria-label="Clear date"
            onClick={() => send("")}
            disabled={pending}
            className="pressable flex min-h-7 min-w-7 shrink-0 items-center justify-center rounded-full text-label-3 hover:text-red disabled:opacity-40"
          >
            <svg viewBox="0 0 24 24" className="h-3 w-3" aria-hidden>
              <path d="M7 7l10 10M17 7L7 17" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
            </svg>
          </button>
        ) : null}
      </span>
      {pending ? <p className="text-caption-1 mt-0.5 px-0.5 text-label-3">Saving…</p> : null}
      {error ? <p className="text-footnote mt-0.5 px-0.5 text-red">{error}</p> : null}
    </div>
  );
}
