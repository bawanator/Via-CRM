import type { ReactNode } from "react";

// Large-title page header, iOS style. `trailing` holds the page's primary
// action (e.g. an Add button) — one action, clearly named.
export function PageHeader({ title, trailing, children }: { title: string; trailing?: ReactNode; children?: ReactNode }) {
  return (
    <header className="mb-3 pt-1">
      <div className="flex items-end justify-between gap-3">
        <h1 className="text-large-title text-label">{title}</h1>
        {trailing ? <div className="pb-0.5">{trailing}</div> : null}
      </div>
      {children}
    </header>
  );
}
