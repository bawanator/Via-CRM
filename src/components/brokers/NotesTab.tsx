"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import type { InteractionRow } from "@/lib/database.types";
import { formatDateTime } from "@/lib/format";
import { addNoteAction } from "@/app/(app)/brokers/actions";
import { SectionHeader } from "@/components/brokers/SectionHeader";

// Notes tab: an always-visible composer on top of a timestamped notes
// timeline (interactions of type "note"). The evergreen `notes` column is the
// "About" field on Overview — this is the running log.
export function NotesTab({ brokerId, notes }: { brokerId: string; notes: InteractionRow[] }) {
  const router = useRouter();
  const [draft, setDraft] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function handleAdd() {
    const summary = draft.trim();
    if (!summary || pending) return;
    startTransition(async () => {
      const res = await addNoteAction({ broker_id: brokerId, summary });
      if (res.ok) {
        setError(null);
        setDraft("");
        router.refresh();
      } else {
        setError(res.error);
      }
    });
  }

  return (
    <section className="mb-6">
      <SectionHeader title="Notes" />

      <div className="card mb-3 rounded-xl bg-card px-4 py-3">
        <textarea
          value={draft}
          rows={3}
          disabled={pending}
          placeholder="Add a note…"
          aria-label="New note"
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
              e.preventDefault();
              handleAdd();
            }
          }}
          className="text-body w-full resize-y rounded-md bg-transparent text-label placeholder:text-label-3 focus:outline-none disabled:opacity-60"
        />
        <div className="flex items-center justify-between gap-3">
          <p className="text-caption-1 text-label-3">⌘↵ to save</p>
          <button
            type="button"
            onClick={handleAdd}
            disabled={pending || draft.trim() === ""}
            className="text-footnote pressable min-h-11 rounded-lg font-semibold text-blue disabled:opacity-40"
          >
            {pending ? "Adding…" : "Add Note"}
          </button>
        </div>
        {error ? <p className="text-footnote text-red">{error}</p> : null}
      </div>

      <div className="card hairline-rows overflow-hidden rounded-xl bg-card">
        {notes.length === 0 ? (
          <div className="flex min-h-11 items-center px-4 py-2.5">
            <p className="text-footnote text-label-3">No notes yet.</p>
          </div>
        ) : (
          notes.map((note) => (
            <div key={note.id} className="px-4 py-2.5">
              <p className="text-body whitespace-pre-wrap break-words text-label">{note.summary}</p>
              <p className="text-footnote mt-0.5 text-label-2">{formatDateTime(note.occurred_at)}</p>
            </div>
          ))
        )}
      </div>
    </section>
  );
}
