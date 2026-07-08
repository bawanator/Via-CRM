import type { ReactNode } from "react";

// Grouped-section header with trailing text actions (44px touch targets),
// matching the GroupedSection header type style.
export function SectionHeader({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <div className="mb-1 flex min-h-11 items-center justify-between gap-3 px-4">
      <h2 className="micro-label">{title}</h2>
      {children ? <div className="flex items-center gap-4">{children}</div> : null}
    </div>
  );
}

export function SectionHeaderButton({
  onClick,
  disabled,
  children,
}: {
  onClick: () => void;
  disabled?: boolean;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="text-footnote pressable min-h-11 rounded-lg font-medium text-blue disabled:opacity-40"
    >
      {children}
    </button>
  );
}
