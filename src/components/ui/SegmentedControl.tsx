"use client";

// iOS segmented control, used for view toggles (e.g. Kanban / List).
export function SegmentedControl<T extends string>({
  options,
  value,
  onChange,
  ariaLabel,
}: {
  options: { value: T; label: string }[];
  value: T;
  onChange: (value: T) => void;
  ariaLabel: string;
}) {
  return (
    <div role="tablist" aria-label={ariaLabel} className="flex rounded-lg bg-fill-2 p-0.5">
      {options.map((opt) => (
        <button
          key={opt.value}
          role="tab"
          aria-selected={value === opt.value}
          onClick={() => onChange(opt.value)}
          className={`text-footnote min-h-11 flex-1 rounded-md px-3 font-medium transition-colors focus-visible:outline-2 focus-visible:outline-blue ${
            value === opt.value ? "bg-elevated text-label shadow-sm" : "text-label-2"
          }`}
        >
          {opt.label}
        </button>
      ))}
    </div>
  );
}
