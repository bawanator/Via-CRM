import type { ComponentType, SVGProps } from "react";
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
export function InteractionListRow({
  interaction,
  showIcon = true,
}: {
  interaction: InteractionRow;
  showIcon?: boolean;
}) {
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

  if (interaction.gmail_thread_id) {
    return (
      <a
        href={`https://mail.google.com/mail/u/0/#all/${interaction.gmail_thread_id}`}
        target="_blank"
        rel="noreferrer"
        className="pressable flex min-h-11 items-start gap-3 px-4 py-2.5"
      >
        {inner}
        <ArrowUpRightIcon className="mt-1 h-4 w-4 shrink-0 text-label-3" />
      </a>
    );
  }
  return <div className="flex min-h-11 items-start gap-3 px-4 py-2.5">{inner}</div>;
}

// Shared empty row for the interaction cards.
export function EmptyCardRow({ text }: { text: string }) {
  return (
    <div className="flex min-h-11 items-center px-4 py-2.5">
      <p className="text-footnote text-label-3">{text}</p>
    </div>
  );
}
