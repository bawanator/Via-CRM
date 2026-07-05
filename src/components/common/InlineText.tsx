"use client";

import { useRef, useState } from "react";
import { useInlineEdit, type InlineSave } from "@/components/common/useInlineEdit";

// Click-to-edit single-line value. Reads like plain editable text: a subtle
// hover fill hints it is editable, click/Enter turns it into an input,
// blur/Enter commits, Esc cancels. No visible "Edit" button, no form box.
export function InlineText({
  value,
  onSave,
  placeholder = "Empty",
  ariaLabel,
  type = "text",
  className = "",
}: {
  value: string | null;
  onSave: InlineSave;
  placeholder?: string;
  ariaLabel?: string;
  type?: "text" | "email" | "tel" | "url";
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
          className="text-body pressable flex min-h-11 w-full items-center rounded-md px-2 -mx-2 text-left transition-colors hover:bg-fill-2 focus-visible:outline-2 focus-visible:outline-blue"
        >
          {value ? (
            <span className="truncate text-label">{value}</span>
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
        type={type}
        value={draft}
        disabled={pending}
        aria-label={ariaLabel}
        placeholder={placeholder}
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
          save(draft.trim());
        }}
        className="text-body min-h-11 w-full rounded-md bg-fill-2 px-2 -mx-2 text-label placeholder:text-label-3 focus:outline-none focus-visible:outline-2 focus-visible:outline-blue disabled:opacity-60"
      />
      {pending ? <p className="text-caption-1 mt-0.5 px-0.5 text-label-3">Saving…</p> : null}
      {error ? <p className="text-footnote mt-0.5 px-0.5 text-red">{error}</p> : null}
    </div>
  );
}
