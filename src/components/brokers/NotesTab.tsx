"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import type { InteractionRow } from "@/lib/database.types";
import { formatDateTime } from "@/lib/format";
import { addNoteAction, deleteInteractionAction } from "@/app/(app)/brokers/actions";
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
          notes.map((note) => <NoteRow key={note.id} brokerId={brokerId} note={note} />)
        )}
      </div>
    </section>
  );
}

// One logged note with a quiet "×" delete at the row end — the first tap turns
// it into an explicit "Delete?" confirm before anything fires.
function NoteRow({ brokerId, note }: { brokerId: string; note: InteractionRow }) {
  const router = useRouter();
  const [confirm, setConfirm] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function handleDelete() {
    setError(null);
    startTransition(async () => {
      const res = await deleteInteractionAction(note.id, brokerId);
      if (res.ok) {
        router.refresh();
      } else {
        setConfirm(false);
        setError(res.error);
      }
    });
  }

  return (
    <div>
      <div className="flex items-start">
        <div className="min-w-0 flex-1 px-4 py-2.5">
          <p className="text-body whitespace-pre-wrap break-words text-label">{note.summary}</p>
          <p className="text-footnote mt-0.5 text-label-2">{formatDateTime(note.occurred_at)}</p>
        </div>
        {confirm ? (
          <button
            type="button"
            onClick={handleDelete}
            onBlur={() => setConfirm(false)}
            disabled={pending}
            aria-label="Confirm delete note"
            className="text-footnote pressable flex min-h-11 shrink-0 items-center whitespace-nowrap px-3 font-semibold text-red disabled:opacity-40"
          >
            Delete?
          </button>
        ) : (
          <button
            type="button"
            onClick={() => setConfirm(true)}
            disabled={pending}
            aria-label="Delete note"
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
