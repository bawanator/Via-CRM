"use client";

import { useState, useTransition } from "react";
import { addSecurityAction, deleteSecurityAction, updateSecurityAction } from "@/app/(app)/deals/actions";
import { GroupedSection } from "@/components/ui/GroupedList";
import { InlineText } from "@/components/common/InlineText";
import type { DealSecurityRow } from "@/lib/database.types";

// The security properties backing the deal — any number, added and removed
// inline. Each address is click-to-edit; the composer row at the bottom adds
// the next one.
export function SecuritiesSection({ dealId, securities }: { dealId: string; securities: DealSecurityRow[] }) {
  return (
    <GroupedSection header="Securities">
      {securities.map((s) => (
        <SecurityRow key={s.id} dealId={dealId} security={s} />
      ))}
      <AddSecurityRow dealId={dealId} empty={securities.length === 0} />
    </GroupedSection>
  );
}

function SecurityRow({ dealId, security }: { dealId: string; security: DealSecurityRow }) {
  const [confirm, setConfirm] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function handleDelete() {
    setError(null);
    startTransition(async () => {
      const res = await deleteSecurityAction(dealId, security.id);
      if (!res.ok) {
        setConfirm(false);
        setError(res.error);
      }
    });
  }

  return (
    <div>
      <div className="flex items-center gap-2 px-4 py-1">
        <div className="min-w-0 flex-1">
          <InlineText
            value={security.address}
            onSave={(v) =>
              v.trim() === ""
                ? Promise.resolve({ ok: false, error: "An address is required — remove the security instead." })
                : updateSecurityAction(dealId, security.id, { address: v })
            }
            ariaLabel="Security address"
          />
        </div>
        {confirm ? (
          <button
            type="button"
            onClick={handleDelete}
            onBlur={() => setConfirm(false)}
            disabled={pending}
            className="text-footnote pressable flex min-h-11 shrink-0 items-center whitespace-nowrap px-2 font-semibold text-red disabled:opacity-40"
          >
            Remove?
          </button>
        ) : (
          <button
            type="button"
            onClick={() => setConfirm(true)}
            disabled={pending}
            aria-label="Remove security"
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

function AddSecurityRow({ dealId, empty }: { dealId: string; empty: boolean }) {
  const [draft, setDraft] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function handleAdd() {
    const address = draft.trim();
    if (!address || pending) return;
    setDraft("");
    startTransition(async () => {
      const res = await addSecurityAction({ deal_id: dealId, address });
      if (!res.ok) {
        setDraft(address);
        setError(res.error);
      } else {
        setError(null);
      }
    });
  }

  return (
    <div className="px-4 py-1.5">
      <div className="flex items-center gap-2">
        <input
          type="text"
          value={draft}
          disabled={pending}
          placeholder={empty ? "Add a security address…" : "Add another security…"}
          aria-label="New security address"
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              handleAdd();
            }
          }}
          className="text-body control-h w-full min-w-0 flex-1 bg-transparent text-label placeholder:text-label-3 focus:outline-none disabled:opacity-60"
        />
        <button
          type="button"
          onClick={handleAdd}
          disabled={pending || draft.trim() === ""}
          className="text-footnote pressable min-h-11 shrink-0 rounded-lg font-semibold text-blue disabled:opacity-40"
        >
          {pending ? "Adding…" : "Add"}
        </button>
      </div>
      {error ? <p className="text-footnote pt-1 text-red">{error}</p> : null}
    </div>
  );
}
