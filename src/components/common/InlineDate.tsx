"use client";

import { useRef, useState } from "react";
import { formatDate } from "@/lib/format";
import { useInlineEdit, type InlineSave } from "@/components/common/useInlineEdit";

// Click-to-edit date. Display shows a friendly formatted date; click reveals a
// native date input. Commits the raw ISO (YYYY-MM-DD) or "" (cleared) on
// blur/Enter; Esc cancels. onSave decides how "" maps to null.
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
  const { editing, error, pending, start, stop, save } = useInlineEdit(committed, onSave);
  const [draft, setDraft] = useState(committed);
  const inputRef = useRef<HTMLInputElement>(null);
  const cancelRef = useRef(false);

  if (!editing) {
    return (
      <div className={className}>
        <button
          type="button"
          aria-label={ariaLabel}
          onClick={() => {
            setDraft(committed);
            cancelRef.current = false;
            start();
          }}
          className="text-body pressable control-h flex w-full items-center rounded-md px-2 -mx-2 text-left transition-colors hover:bg-fill-2 focus-visible:outline-2 focus-visible:outline-blue"
        >
          {value ? (
            <span className="truncate text-label">{formatDate(value)}</span>
          ) : (
            <span className="truncate text-label-3">{placeholder}</span>
          )}
        </button>
      </div>
    );
  }

  return (
    <div className={className}>
      <input
        ref={inputRef}
        autoFocus
        type="date"
        value={draft}
        disabled={pending}
        aria-label={ariaLabel}
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            inputRef.current?.blur();
          } else if (e.key === "Escape") {
            e.preventDefault();
            cancelRef.current = true;
            inputRef.current?.blur();
          }
        }}
        onBlur={() => {
          if (cancelRef.current) {
            cancelRef.current = false;
            stop();
            return;
          }
          save(draft);
        }}
        className="text-body control-h w-full rounded-md bg-fill-2 px-2 -mx-2 text-label focus:outline-none focus-visible:outline-2 focus-visible:outline-blue disabled:opacity-60"
      />
      {pending ? <p className="text-caption-1 mt-0.5 px-0.5 text-label-3">Saving…</p> : null}
      {error ? <p className="text-footnote mt-0.5 px-0.5 text-red">{error}</p> : null}
    </div>
  );
}
