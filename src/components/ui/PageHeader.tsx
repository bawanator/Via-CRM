import type { ReactNode } from "react";

// Large-title page header, iOS style. `trailing` holds the page's primary
// action (e.g. an Add button) — one action, clearly named.
export function PageHeader({ title, trailing, children }: { title: string; trailing?: ReactNode; children?: ReactNode }) {
  return (
    <header className="mb-4 pt-2">
      <div className="flex items-end justify-between gap-3">
        <h1 className="text-large-title text-label">{title}</h1>
        {trailing ? <div className="pb-1">{trailing}</div> : null}
      </div>
      {children}
    </header>
  );
}
