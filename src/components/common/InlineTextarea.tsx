"use client";

import { useRef, useState } from "react";
import { useInlineEdit, type InlineSave } from "@/components/common/useInlineEdit";

// Multi-line click-to-edit value. Enter inserts a newline; blur or ⌘/Ctrl+Enter
// commits; Esc cancels. Reads like an editable paragraph, not a form box.
export function InlineTextarea({
  value,
  onSave,
  placeholder = "Empty",
  ariaLabel,
  rows = 3,
  className = "",
}: {
  value: string | null;
  onSave: InlineSave;
  placeholder?: string;
  ariaLabel?: string;
  rows?: number;
  className?: string;
}) {
  const committed = value ?? "";
  const { editing, error, pending, start, stop, save } = useInlineEdit(committed, onSave);
  const [draft, setDraft] = useState(committed);
  const areaRef = useRef<HTMLTextAreaElement>(null);
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
          className="text-body pressable block min-h-11 w-full rounded-md px-2 -mx-2 py-1.5 text-left transition-colors hover:bg-fill-2 focus-visible:outline-2 focus-visible:outline-blue"
        >
          {value ? (
            <span className="block whitespace-pre-wrap break-words text-label">{value}</span>
          ) : (
            <span className="text-label-3">{placeholder}</span>
          )}
        </button>
      </div>
    );
  }

  return (
    <div className={className}>
      <textarea
        ref={areaRef}
        autoFocus
        rows={rows}
        value={draft}
        disabled={pending}
        aria-label={ariaLabel}
        placeholder={placeholder}
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
            e.preventDefault();
            areaRef.current?.blur();
          } else if (e.key === "Escape") {
            e.preventDefault();
            cancelRef.current = true;
            areaRef.current?.blur();
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
        className="text-body w-full resize-y rounded-md bg-fill-2 px-2 -mx-2 py-1.5 text-label placeholder:text-label-3 focus:outline-none focus-visible:outline-2 focus-visible:outline-blue disabled:opacity-60"
      />
      {pending ? (
        <p className="text-caption-1 mt-0.5 px-0.5 text-label-3">Saving…</p>
      ) : (
        <p className="text-caption-1 mt-0.5 px-0.5 text-label-3">⌘↵ to save · Esc to cancel</p>
      )}
      {error ? <p className="text-footnote mt-0.5 px-0.5 text-red">{error}</p> : null}
    </div>
  );
}
