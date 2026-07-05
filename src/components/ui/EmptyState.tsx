import type { ReactNode } from "react";

export function EmptyState({ title, hint, action }: { title: string; hint?: string; action?: ReactNode }) {
  return (
    <div className="card flex flex-col items-center gap-1.5 rounded-xl bg-card px-6 py-8 text-center">
      <p className="text-headline text-label-2">{title}</p>
      {hint ? <p className="text-subheadline max-w-sm text-label-3">{hint}</p> : null}
      {action ? <div className="mt-2">{action}</div> : null}
    </div>
  );
}
