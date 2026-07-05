"use client";

import { useRef, useState, useTransition } from "react";
import { updateDealFieldAction } from "@/app/(app)/deals/actions";

// Click-to-edit deal title, styled as the page heading. Same commit rules as
// the Inline* primitives (Enter/blur commits, Esc cancels) but title-sized.
export function DealTitle({ dealId, name }: { dealId: string; name: string }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(name);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const inputRef = useRef<HTMLInputElement>(null);
  const cancelRef = useRef(false);

  function commit(next: string) {
    const trimmed = next.trim();
    if (trimmed === name || trimmed === "") {
      setEditing(false);
      setError(null);
      return;
    }
    startTransition(async () => {
      const res = await updateDealFieldAction(dealId, "name", trimmed);
      if (res.ok) {
        setEditing(false);
        setError(null);
      } else {
        setError(res.error);
      }
    });
  }

  if (!editing) {
    return (
      <button
        type="button"
        aria-label="Deal name"
        onClick={() => {
          setDraft(name);
          cancelRef.current = false;
          setError(null);
          setEditing(true);
        }}
        className="text-title-1 pressable -mx-1 block rounded-md px-1 text-left text-label transition-colors hover:bg-fill-2 focus-visible:outline-2 focus-visible:outline-blue"
      >
        {name}
      </button>
    );
  }

  return (
    <div>
      <input
        ref={inputRef}
        autoFocus
        value={draft}
        disabled={pending}
        aria-label="Deal name"
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            inputRef.current?.blur();
          } else if (e.key === "Escape") {
            e.preventDefault();
            cancelRef.current = true;
            inputRef.current?.blur();
          }
        }}
        onBlur={() => {
          if (cancelRef.current) {
            cancelRef.current = false;
            setEditing(false);
            setError(null);
            return;
          }
          commit(draft);
        }}
        className="text-title-1 -mx-1 w-full rounded-md bg-fill-2 px-1 text-label focus:outline-none focus-visible:outline-2 focus-visible:outline-blue disabled:opacity-60"
      />
      {error ? <p className="text-footnote mt-0.5 text-red">{error}</p> : null}
    </div>
  );
}
