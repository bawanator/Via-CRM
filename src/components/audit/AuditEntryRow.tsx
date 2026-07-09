"use client";

import Link from "next/link";
import { useState } from "react";
import { diffAuditEntry } from "@/lib/crm/audit";
import type { AuditAction, AuditLogRow, ChangeSource } from "@/lib/database.types";
import { formatDateTime } from "@/lib/format";
import { Badge, type BadgeTone } from "@/components/ui/Badge";

// One audit entry: tap to expand a field-level diff. Read-only by design —
// history is something you look at, never something you edit.

const ACTION_TONE: Record<AuditAction, BadgeTone> = {
  insert: "green",
  update: "blue",
  delete: "red",
};

// Sources are provenance, not status — all gray; the label differentiates.
// (Orange is reserved for "due soon", and blue already means "update" here.)
const SOURCE_TONE: Record<ChangeSource, BadgeTone> = {
  ui: "gray",
  mcp: "gray",
  import: "gray",
  system: "gray",
};

function truncate(s: string, max = 120): string {
  return s.length > max ? `${s.slice(0, max - 1)}…` : s;
}

// Values are display-only: primitives as-is, everything else JSON.stringify'd.
function formatValue(v: unknown): string {
  if (v == null) return "—";
  if (typeof v === "string") return truncate(v);
  if (typeof v === "number" || typeof v === "boolean") return String(v);
  return truncate(JSON.stringify(v));
}

function asString(v: unknown): string | null {
  return typeof v === "string" && v.length > 0 ? v : null;
}

// Human label for the changed record, derived from the row snapshot.
function recordLabel(entry: AuditLogRow): string {
  const data = entry.after ?? entry.before ?? {};
  const fallback = entry.record_id.slice(0, 8);
  switch (entry.table_name) {
    case "brokers":
      return asString(data.full_name) ?? fallback;
    case "deals":
      return asString(data.name) ?? fallback;
    case "key_dates":
    case "drive_links":
      return asString(data.label) ?? fallback;
    case "deal_securities":
      return asString(data.address) ?? fallback;
    case "guarantors":
      return asString(data.full_name) ?? fallback;
    case "interactions": {
      const summary = asString(data.summary);
      return summary ? truncate(summary, 60) : fallback;
    }
    default:
      return fallback;
  }
}

// Where "Open …" should go: the record itself for brokers/deals, the parent
// record for child tables (via ids present in the JSON snapshot).
function recordLink(entry: AuditLogRow): { href: string; label: string } | null {
  const data = { ...(entry.before ?? {}), ...(entry.after ?? {}) };
  switch (entry.table_name) {
    case "brokers":
      return { href: `/brokers/${entry.record_id}`, label: "Open record" };
    case "deals":
      return { href: `/deals/${entry.record_id}`, label: "Open record" };
    case "key_dates":
    case "deal_securities":
    case "guarantors": {
      const dealId = asString(data.deal_id);
      return dealId ? { href: `/deals/${dealId}`, label: "Open deal" } : null;
    }
    case "interactions": {
      const dealId = asString(data.deal_id);
      if (dealId) return { href: `/deals/${dealId}`, label: "Open deal" };
      const brokerId = asString(data.broker_id);
      return brokerId ? { href: `/brokers/${brokerId}`, label: "Open broker" } : null;
    }
    case "drive_links": {
      const parentId = asString(data.parent_id);
      const parentType = asString(data.parent_type);
      if (!parentId) return null;
      if (parentType === "deal") return { href: `/deals/${parentId}`, label: "Open deal" };
      if (parentType === "broker") return { href: `/brokers/${parentId}`, label: "Open broker" };
      return null;
    }
    default:
      return null;
  }
}

export function AuditEntryRow({ entry }: { entry: AuditLogRow }) {
  const [open, setOpen] = useState(false);
  const changes = diffAuditEntry(entry);
  const link = recordLink(entry);
  const showBefore = entry.action !== "insert";
  const showAfter = entry.action !== "delete";

  return (
    <div>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className="pressable flex w-full flex-col items-stretch gap-1 px-4 py-2.5 text-left"
      >
        <span className="flex items-center gap-2">
          <Badge tone={ACTION_TONE[entry.action]}>{entry.action}</Badge>
          <span className="text-footnote shrink-0 text-label-2">{entry.table_name}</span>
          <span className="text-body min-w-0 flex-1 truncate font-medium text-label">{recordLabel(entry)}</span>
          <svg
            className={`h-3.5 w-3.5 shrink-0 text-label-3 transition-transform ${open ? "rotate-90" : ""}`}
            viewBox="0 0 14 14"
            fill="none"
            aria-hidden
          >
            <path d="M5 2.5 9.5 7 5 11.5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </span>
        <span className="flex items-center gap-2">
          <span className="text-footnote text-label-3">{formatDateTime(entry.changed_at)}</span>
          <Badge tone={SOURCE_TONE[entry.source]}>{entry.source}</Badge>
        </span>
      </button>

      {open ? (
        <div className="border-t-[0.5px] border-separator px-4 py-3">
          {changes.length === 0 ? (
            <p className="text-footnote text-label-3">No field changes recorded.</p>
          ) : (
            <ul className="flex flex-col gap-1.5">
              {changes.map((c) => (
                <li key={c.field} className="text-footnote flex flex-wrap items-baseline gap-x-1.5 gap-y-0.5">
                  <span className="font-medium text-label">{c.field}</span>
                  <span className="text-label-3">·</span>
                  {showBefore ? (
                    <span className={`break-all ${c.before != null ? "text-red line-through" : "text-label-3"}`}>
                      {formatValue(c.before)}
                    </span>
                  ) : null}
                  {showBefore && showAfter ? <span className="text-label-3">→</span> : null}
                  {showAfter ? (
                    <span className={`break-all ${c.after != null ? "text-green" : "text-label-3"}`}>
                      {formatValue(c.after)}
                    </span>
                  ) : null}
                </li>
              ))}
            </ul>
          )}
          {link ? (
            <Link
              href={link.href}
              className="text-footnote pressable -mx-1 mt-1.5 inline-flex min-h-11 items-center rounded-lg px-1 font-medium text-blue"
            >
              {link.label} →
            </Link>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
