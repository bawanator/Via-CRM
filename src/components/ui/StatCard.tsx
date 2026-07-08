import Link from "next/link";
import type { ReactNode, SVGProps } from "react";

// Supabase-style stat card: an icon in a bordered square, a mono uppercase
// micro-label, and a bold value. Counts and dates only — never money.
export function StatCard({
  label,
  value,
  sub,
  icon: Icon,
  href,
  dot,
}: {
  label: string;
  value: ReactNode;
  sub?: ReactNode;
  icon: (props: SVGProps<SVGSVGElement>) => ReactNode;
  href?: string;
  dot?: "green" | "orange" | "red";
}) {
  const dotColor = dot === "green" ? "bg-green" : dot === "orange" ? "bg-orange" : "bg-red";
  const inner = (
    <>
      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-separator text-label-2">
        <Icon className="h-4.5 w-4.5" />
      </span>
      <span className="min-w-0">
        <span className="micro-label block">{label}</span>
        <span className="text-title-3 flex items-center gap-1.5 text-label">
          {dot ? <span className={`h-2 w-2 shrink-0 rounded-full ${dotColor}`} aria-hidden /> : null}
          <span className="truncate">{value}</span>
        </span>
        {sub ? <span className="text-footnote block truncate text-label-2">{sub}</span> : null}
      </span>
    </>
  );
  const cls = "card flex items-center gap-3.5 rounded-xl bg-card px-4 py-3.5";
  if (href) {
    return (
      <Link href={href} className={`${cls} pressable`}>
        {inner}
      </Link>
    );
  }
  return <div className={cls}>{inner}</div>;
}
