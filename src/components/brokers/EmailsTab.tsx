"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import type { InteractionRow } from "@/lib/database.types";
import { deleteInteractionAction } from "@/app/(app)/brokers/actions";
import { EmptyCardRow, InteractionListRow } from "@/components/brokers/InteractionListRow";
import { SectionHeader, SectionHeaderButton } from "@/components/brokers/SectionHeader";

const SYNC_FALLBACK_ERROR = "Gmail sync failed — connect Google or try again.";

// Emails tab: synced email interactions, newest first, each deep-linking to
// the Gmail thread. The sync button pulls recent threads for this contact.
export function EmailsTab({
  brokerId,
  brokerEmail,
  emails,
}: {
  brokerId: string;
  brokerEmail: string | null;
  emails: InteractionRow[];
}) {
  const router = useRouter();
  const [syncError, setSyncError] = useState<string | null>(null);
  const [syncing, startSync] = useTransition();

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
      <SectionHeader title="Emails">
        {brokerEmail ? (
          <SectionHeaderButton onClick={handleSync} disabled={syncing}>
            {syncing ? "Syncing…" : "Sync Recent Email"}
          </SectionHeaderButton>
        ) : null}
      </SectionHeader>
      {syncError ? <p className="text-footnote mb-1.5 px-4 text-red">{syncError}</p> : null}

      <div className="card hairline-rows overflow-hidden rounded-xl bg-card">
        {emails.length === 0 ? (
          <EmptyCardRow text={brokerEmail ? "No emails synced yet." : "Add an email address to sync Gmail."} />
        ) : (
          emails.map((interaction) => (
            <InteractionListRow
              key={interaction.id}
              interaction={interaction}
              showIcon={false}
              onDelete={async () => {
                const res = await deleteInteractionAction(interaction.id, brokerId);
                if (res.ok) router.refresh();
                return res;
              }}
            />
          ))
        )}
      </div>
    </section>
  );
}
