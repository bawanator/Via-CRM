// Building-ish outline icon for the Companies nav item. Lives here (not in
// ui/icons.tsx) because that file is owned elsewhere; drawn to match the same
// SF-Symbols-flavoured style: 24×24 viewBox, stroke-based, 1.8 weight.
import type { SVGProps } from "react";

export function CompanyIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.8}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
      {...props}
    >
      <path d="M4.5 20.5v-15a2 2 0 0 1 2-2H13a2 2 0 0 1 2 2v15" />
      <path d="M15 9.5h2.5a2 2 0 0 1 2 2v9" />
      <path d="M2.5 20.5h19" />
      <path d="M8 7.5h3.5M8 11h3.5M8 14.5h3.5" />
    </svg>
  );
}
