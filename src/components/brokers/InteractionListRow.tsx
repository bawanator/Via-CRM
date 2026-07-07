"use client";

import { useState, useTransition, type ComponentType, type SVGProps } from "react";
import type { InteractionRow, InteractionType } from "@/lib/database.types";
import { formatDateTime } from "@/lib/format";
import { ArrowUpRightIcon, ClockIcon, EnvelopeIcon, PeopleIcon, PhoneIcon } from "@/components/ui/icons";

const TYPE_ICON: Record<InteractionType, ComponentType<SVGProps<SVGSVGElement>>> = {
  email: EnvelopeIcon,
  call: PhoneIcon,
  meeting: PeopleIcon,
  note: ClockIcon,
};

// One interaction as a sparse timeline row: summary + timestamp. Email rows
// with a synced thread deep-link into Gmail. Used across the profile tabs.
//
// When `onDelete` is provided, a quiet "×" sits at the row end; the first tap
// turns it into an explicit "Delete?" confirm before anything fires (deleting
// a synced email only removes the CRM log entry — the Gmail thread stays).
export function InteractionListRow({
  interaction,
  showIcon = true,
  onDelete,
}: {
  interaction: InteractionRow;
  showIcon?: boolean;
  onDelete?: () => Promise<{ ok: boolean; error?: string }>;
}) {
  const [confirm, setConfirm] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function handleDelete() {
    if (!onDelete) return;
    setError(null);
    startTransition(async () => {
      const res = await onDelete();
      if (!res.ok) {
        setConfirm(false);
        setError(res.error ?? "Couldn’t delete this entry.");
      }
    });
  }

  const Icon = TYPE_ICON[interaction.type];
  const inner = (
    <>
      {showIcon ? <Icon className="mt-0.5 h-5 w-5 shrink-0 text-label-2" /> : null}
      <div className="min-w-0 flex-1">
        <p className="text-body line-clamp-2 text-label">{interaction.summary}</p>
        <p className="text-footnote mt-0.5 text-label-2">{formatDateTime(interaction.occurred_at)}</p>
      </div>
    </>
  );

  const body = interaction.gmail_thread_id ? (
    <a
      href={`https://mail.google.com/mail/u/0/#all/${interaction.gmail_thread_id}`}
      target="_blank"
      rel="noreferrer"
      className="pressable flex min-h-11 min-w-0 flex-1 items-start gap-3 px-4 py-2.5"
    >
      {inner}
      <ArrowUpRightIcon className="mt-1 h-4 w-4 shrink-0 text-label-3" />
    </a>
  ) : (
    <div className="flex min-h-11 min-w-0 flex-1 items-start gap-3 px-4 py-2.5">{inner}</div>
  );

  if (!onDelete) return body;

  return (
    <div>
      <div className="flex items-start">
        {body}
        {confirm ? (
          <button
            type="button"
            onClick={handleDelete}
            onBlur={() => setConfirm(false)}
            disabled={pending}
            aria-label="Confirm delete entry"
            className="text-footnote pressable flex min-h-11 shrink-0 items-center whitespace-nowrap px-3 font-semibold text-red disabled:opacity-40"
          >
            Delete?
          </button>
        ) : (
          <button
            type="button"
            onClick={() => setConfirm(true)}
            disabled={pending}
            aria-label="Delete entry"
            className="pressable flex min-h-11 min-w-11 shrink-0 items-center justify-center text-label-3 transition-colors hover:text-red disabled:opacity-40"
          >
            <svg viewBox="0 0 24 24" className="h-4 w-4" aria-hidden>
              <path d="M7 7l10 10M17 7L7 17" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
            </svg>
          </button>
        )}
      </div>
      {error ? <p className="text-footnote px-4 pb-2 text-red">{error}</p> : null}
    </div>
  );
}

// Shared empty row for the interaction cards.
export function EmptyCardRow({ text }: { text: string }) {
  return (
    <div className="flex min-h-11 items-center px-4 py-2.5">
      <p className="text-footnote text-label-3">{text}</p>
    </div>
  );
}
