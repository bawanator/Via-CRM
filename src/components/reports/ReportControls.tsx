"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Button } from "@/components/ui/Button";
import { deleteReportAction, setReportPinnedAction } from "@/app/(app)/reports/actions";
import { ReportBuilderSheet } from "@/components/reports/ReportBuilderSheet";

type BrokerOption = { id: string; full_name: string };
type Report = { id: string; name: string; spec: Record<string, unknown>; pinned: boolean };

// Pin/unpin, edit and delete for one saved report. Pinning a 4th is blocked
// client-side (with a hint) and again server-side by setPinned.
export function ReportControls({
  report,
  brokers,
  pinnedCount,
}: {
  report: Report;
  brokers: BrokerOption[];
  pinnedCount: number;
}) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [pending, startTransition] = useTransition();

  const atPinLimit = !report.pinned && pinnedCount >= 3;

  function togglePin() {
    setError(null);
    startTransition(async () => {
      const res = await setReportPinnedAction(report.id, !report.pinned);
      if (!res.ok) {
        setError(res.error);
        return;
      }
      router.refresh();
    });
  }

  function remove() {
    setError(null);
    startTransition(async () => {
      const res = await deleteReportAction(report.id);
      if (!res.ok) {
        setError(res.error);
        return;
      }
      setConfirmingDelete(false);
      router.refresh();
    });
  }

  return (
    <div className="mt-2 flex flex-wrap items-center gap-1">
      <Button
        variant={report.pinned ? "tinted" : "plain"}
        onClick={togglePin}
        disabled={pending || atPinLimit}
        title={atPinLimit ? "Unpin another report first — at most 3 can be pinned." : undefined}
      >
        {report.pinned ? "Unpin" : "Pin"}
      </Button>

      <ReportBuilderSheet
        brokers={brokers}
        report={report}
        trigger={<Button variant="plain">Edit</Button>}
      />

      <div className="ml-auto flex items-center gap-1">
        {confirmingDelete ? (
          <>
            <Button variant="plain" onClick={() => setConfirmingDelete(false)} disabled={pending}>
              Cancel
            </Button>
            <Button variant="destructive" onClick={remove} disabled={pending}>
              Confirm delete
            </Button>
          </>
        ) : (
          <Button variant="destructive" onClick={() => setConfirmingDelete(true)} disabled={pending}>
            Delete
          </Button>
        )}
      </div>

      {atPinLimit ? (
        <p className="text-footnote w-full text-label-3">3 reports are already pinned. Unpin one to pin this.</p>
      ) : null}
      {error ? <p className="text-footnote w-full text-red">{error}</p> : null}
    </div>
  );
}
