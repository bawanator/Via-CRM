"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition, type ComponentType, type FormEvent, type SVGProps } from "react";
import type { InteractionRow, InteractionType } from "@/lib/database.types";
import { INTERACTION_TYPES, INTERACTION_TYPE_LABELS } from "@/lib/domain";
import { formatDateTime } from "@/lib/format";
import { todayISO } from "@/lib/dates";
import { logInteractionAction } from "@/app/(app)/brokers/actions";
import { Sheet } from "@/components/ui/Sheet";
import { DateField, FieldGroup, SelectField, TextAreaField } from "@/components/ui/Field";
import { ArrowUpRightIcon, ClockIcon, EnvelopeIcon, PeopleIcon, PhoneIcon } from "@/components/ui/icons";
import { SectionHeader, SectionHeaderButton } from "@/components/brokers/SectionHeader";
import { SheetSubmitButton } from "@/components/brokers/ContactFormFields";

const TYPE_ICON: Record<InteractionType, ComponentType<SVGProps<SVGSVGElement>>> = {
  email: EnvelopeIcon,
  call: PhoneIcon,
  meeting: PeopleIcon,
  note: ClockIcon,
};

const FORM_ID = "log-interaction-form";
const SYNC_FALLBACK_ERROR = "Gmail sync failed — connect Google or try again.";

export function InteractionsSection({
  brokerId,
  brokerEmail,
  interactions,
  deals,
}: {
  brokerId: string;
  brokerEmail: string | null;
  interactions: InteractionRow[];
  deals: { id: string; name: string }[];
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [logError, setLogError] = useState<string | null>(null);
  const [syncError, setSyncError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const [syncing, startSync] = useTransition();

  function handleLog(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const get = (key: string) => {
      const v = fd.get(key);
      return typeof v === "string" ? v : "";
    };
    const input = {
      broker_id: brokerId,
      deal_id: get("deal_id") || null,
      type: get("type"),
      occurred_at: get("occurred_at") || undefined,
      summary: get("summary"),
    };
    startTransition(async () => {
      const res = await logInteractionAction(input);
      if (res.ok) {
        setLogError(null);
        setOpen(false);
        router.refresh();
      } else {
        setLogError(res.error);
      }
    });
  }

  // Contract with the Gmail module: POST {brokerId} → {ok:true, synced:number}
  // or {ok:false, error:string}. Failure never blocks the page.
  function handleSync() {
    setSyncError(null);
    startSync(async () => {
      try {
        const res = await fetch("/api/gmail/sync", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ brokerId }),
        });
        const json: unknown = await res.json().catch(() => null);
        const ok = typeof json === "object" && json !== null && (json as { ok?: unknown }).ok === true;
        if (res.ok && ok) {
          router.refresh();
        } else {
          const serverError =
            typeof json === "object" && json !== null && typeof (json as { error?: unknown }).error === "string"
              ? (json as { error: string }).error
              : null;
          setSyncError(serverError ?? SYNC_FALLBACK_ERROR);
        }
      } catch {
        setSyncError(SYNC_FALLBACK_ERROR);
      }
    });
  }

  return (
    <section className="mb-6">
      <SectionHeader title="Interactions">
        {brokerEmail ? (
          <SectionHeaderButton onClick={handleSync} disabled={syncing}>
            {syncing ? "Syncing…" : "Sync Recent Email"}
          </SectionHeaderButton>
        ) : null}
        <SectionHeaderButton
          onClick={() => {
            setLogError(null);
            setOpen(true);
          }}
        >
          Log Interaction
        </SectionHeaderButton>
      </SectionHeader>
      {syncError ? <p className="text-footnote mb-1.5 px-4 text-red">{syncError}</p> : null}

      <div className="hairline-rows overflow-hidden rounded-xl bg-card">
        {interactions.length === 0 ? (
          <div className="flex min-h-11 items-center px-4 py-2.5">
            <p className="text-footnote text-label-3">No interactions logged yet.</p>
          </div>
        ) : (
          interactions.map((interaction) => <TimelineRow key={interaction.id} interaction={interaction} />)
        )}
      </div>

      <Sheet
        open={open}
        onOpenChange={setOpen}
        title="Log Interaction"
        action={
          <SheetSubmitButton formId={FORM_ID} pending={pending}>
            Save
          </SheetSubmitButton>
        }
      >
        <form id={FORM_ID} onSubmit={handleLog}>
          <FieldGroup>
            <SelectField label="Type" name="type" defaultValue="call">
              {INTERACTION_TYPES.map((t) => (
                <option key={t} value={t}>
                  {INTERACTION_TYPE_LABELS[t]}
                </option>
              ))}
            </SelectField>
            <DateField label="Occurred" name="occurred_at" defaultValue={todayISO()} />
            {deals.length > 0 ? (
              <SelectField label="Deal" name="deal_id" defaultValue="">
                <option value="">None</option>
                {deals.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.name}
                  </option>
                ))}
              </SelectField>
            ) : null}
          </FieldGroup>
          <FieldGroup>
            <TextAreaField label="Summary" name="summary" required placeholder="What happened?" />
          </FieldGroup>
          {logError ? <p className="text-footnote px-4 text-red">{logError}</p> : null}
        </form>
      </Sheet>
    </section>
  );
}

function TimelineRow({ interaction }: { interaction: InteractionRow }) {
  const Icon = TYPE_ICON[interaction.type];
  const inner = (
    <>
      <Icon className="mt-0.5 h-5 w-5 shrink-0 text-label-2" />
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
