"use client";

import { useRouter } from "next/navigation";

// Detail-page back affordance: goes to the previous page in history (wherever
// you came from — Today, search, a company tab). Deep links with no history
// fall back to the section's list page.
export function BackButton({ fallback, label = "Back" }: { fallback: string; label?: string }) {
  const router = useRouter();
  return (
    <button
      type="button"
      onClick={() => {
        if (window.history.length > 1) router.back();
        else router.push(fallback);
      }}
      aria-label="Go back"
      className="pressable text-body -ml-2 mb-1 inline-flex min-h-9 items-center gap-0.5 rounded-lg px-2 font-medium text-blue focus-visible:outline-2 focus-visible:outline-blue"
    >
      <svg className="h-4 w-4" viewBox="0 0 16 16" fill="none" aria-hidden>
        <path d="M10 3 5 8l5 5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
      {label}
    </button>
  );
}
