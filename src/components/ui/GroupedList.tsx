import Link from "next/link";
import type { ReactNode } from "react";

// Settings-app style grouped inset lists — the workhorse of every screen.

export function GroupedSection({
  header,
  footer,
  children,
  className = "",
}: {
  header?: ReactNode;
  footer?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={`mb-6 ${className}`}>
      {header ? (
        <h2 className="text-footnote mb-1.5 px-4 uppercase tracking-wide text-label-2">{header}</h2>
      ) : null}
      <div className="card hairline-rows overflow-hidden rounded-xl bg-card">{children}</div>
      {footer ? <p className="text-footnote mt-1.5 px-4 text-label-2">{footer}</p> : null}
    </section>
  );
}

// A plain row. 44px minimum touch target.
export function Row({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <div className={`flex min-h-11 items-center gap-3 px-4 py-2.5 ${className}`}>{children}</div>;
}

// Tappable row that navigates, with the iOS chevron affordance.
export function LinkRow({
  href,
  children,
  className = "",
}: {
  href: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <Link href={href} className={`pressable flex min-h-11 items-center gap-3 px-4 py-2.5 ${className}`}>
      <div className="min-w-0 flex-1">{children}</div>
      <svg className="h-3.5 w-3.5 shrink-0 text-label-3" viewBox="0 0 14 14" fill="none" aria-hidden>
        <path d="M5 2.5 9.5 7 5 11.5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    </Link>
  );
}

// Label-left, value-right detail row (Settings style).
export function DetailRow({ label, value, href }: { label: string; value: ReactNode; href?: string }) {
  const inner = (
    <>
      <span className="text-body shrink-0 text-label">{label}</span>
      <span className="text-body min-w-0 flex-1 truncate text-right text-label-2">{value ?? "—"}</span>
    </>
  );
  if (href) {
    return (
      <Link href={href} className="pressable flex min-h-11 items-center justify-between gap-4 px-4 py-2.5">
        <span className="text-body shrink-0 text-label">{label}</span>
        <span className="text-body min-w-0 flex-1 truncate text-right text-blue">{value ?? "—"}</span>
      </Link>
    );
  }
  return <div className="flex min-h-11 items-center justify-between gap-4 px-4 py-2.5">{inner}</div>;
}
