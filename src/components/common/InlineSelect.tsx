"use client";

import { useInlineEdit, type InlineSave } from "@/components/common/useInlineEdit";

export type InlineSelectOption = { value: string; label: string };

// Click-to-edit dropdown. Display shows the selected option's label; click
// reveals a native select that commits immediately on change. Esc / blur
// without a change cancels. Keyboard accessible; 44px target.
export function InlineSelect({
  value,
  options,
  onSave,
  placeholder = "Not set",
  ariaLabel,
  className = "",
}: {
  value: string | null;
  options: InlineSelectOption[];
  onSave: InlineSave;
  placeholder?: string;
  ariaLabel?: string;
  className?: string;
}) {
  const committed = value ?? "";
  const { editing, error, pending, start, stop, save } = useInlineEdit(committed, onSave);
  const selected = options.find((o) => o.value === value);

  if (!editing) {
    return (
      <div className={className}>
        <button
          type="button"
          aria-label={ariaLabel}
          onClick={start}
          className="text-body pressable flex min-h-11 w-full items-center rounded-md px-2 -mx-2 text-left transition-colors hover:bg-fill-2 focus-visible:outline-2 focus-visible:outline-blue"
        >
          {selected ? (
            <span className="truncate text-label">{selected.label}</span>
          ) : (
            <span className="truncate text-label-3">{placeholder}</span>
          )}
        </button>
      </div>
    );
  }

  return (
    <div className={className}>
      <select
        autoFocus
        defaultValue={committed}
        disabled={pending}
        aria-label={ariaLabel}
        onChange={(e) => save(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Escape") {
            e.preventDefault();
            stop();
          }
        }}
        onBlur={stop}
        className="text-body min-h-11 w-full rounded-md bg-fill-2 px-2 -mx-2 text-label focus:outline-none focus-visible:outline-2 focus-visible:outline-blue disabled:opacity-60"
      >
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
      {pending ? <p className="text-caption-1 mt-0.5 px-0.5 text-label-3">Saving…</p> : null}
      {error ? <p className="text-footnote mt-0.5 px-0.5 text-red">{error}</p> : null}
    </div>
  );
}
