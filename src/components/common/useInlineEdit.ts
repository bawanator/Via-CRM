"use client";

import { useState, useTransition } from "react";

// The contract every inline-edit save follows. Owning pages pass a server
// action (or a thin client wrapper around one) that never throws — it resolves
// { ok: true } on success or { ok: false, error } with a human message.
export type InlineSaveResult = { ok: boolean; error?: string };
export type InlineSave = (value: string) => Promise<InlineSaveResult>;

// Shared state machine for the Inline* click-to-edit primitives. Each component
// owns its own draft (the control type differs), but editing/pending/error and
// the commit rules live here so behaviour is identical across text/date/select.
export function useInlineEdit(committedValue: string, onSave: InlineSave) {
  const [editing, setEditing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const start = () => {
    setError(null);
    setEditing(true);
  };

  const stop = () => {
    setError(null);
    setEditing(false);
  };

  // Commit `next`. A no-op edit (unchanged value) just closes without a write.
  // On failure we stay in edit mode and surface the error inline.
  const save = (next: string) => {
    if (next === committedValue) {
      stop();
      return;
    }
    startTransition(async () => {
      const res = await onSave(next);
      if (res.ok) {
        setError(null);
        setEditing(false);
      } else {
        setError(res.error ?? "Couldn’t save. Try again.");
      }
    });
  };

  return { editing, error, pending, start, stop, save };
}
