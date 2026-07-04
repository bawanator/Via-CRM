// Gmail read-only sync — raw REST via fetch (no googleapis dependency).
//
// The CRM is an index into Gmail, not a copy: we store subject, date, snippet
// and thread id only. Bodies are never fetched (format=metadata) and never
// stored. Scopes are gmail.readonly only — never send/modify.

import type { InteractionInsert } from "@/lib/database.types";
import type { Db } from "@/lib/crm/db";

const TOKEN_URL = "https://oauth2.googleapis.com/token";
const GMAIL_BASE = "https://gmail.googleapis.com/gmail/v1";

// ---------------------------------------------------------------------------
// OAuth
// ---------------------------------------------------------------------------

/**
 * Exchange the stored refresh token for a short-lived access token.
 * Throws a descriptive Error (including Google's error code, e.g.
 * "invalid_grant") on failure so callers can surface a useful message.
 */
export async function refreshAccessToken(refreshToken: string): Promise<string> {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  if (!clientId || !clientSecret) {
    throw new Error("Missing GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET environment variables");
  }

  const res = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      refresh_token: refreshToken,
      grant_type: "refresh_token",
    }),
  });

  const data = (await res.json().catch(() => null)) as {
    access_token?: string;
    error?: string;
    error_description?: string;
  } | null;

  if (!res.ok || !data?.access_token) {
    const code = data?.error ?? `HTTP ${res.status}`;
    const detail = data?.error_description ? ` — ${data.error_description}` : "";
    throw new Error(`Google token refresh failed (${code})${detail}`);
  }
  return data.access_token;
}

// ---------------------------------------------------------------------------
// Gmail REST (metadata only)
// ---------------------------------------------------------------------------

type GmailHeader = { name?: string; value?: string };
type GmailMessage = {
  internalDate?: string; // epoch millis as a string
  snippet?: string;
  payload?: { headers?: GmailHeader[] };
};
type GmailThread = { id?: string; snippet?: string; messages?: GmailMessage[] };

async function gmailGet<T>(accessToken: string, path: string, context: string): Promise<T> {
  const res = await fetch(`${GMAIL_BASE}${path}`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) {
    const body = (await res.json().catch(() => null)) as { error?: { message?: string; status?: string } } | null;
    const detail = body?.error?.message ?? body?.error?.status ?? "";
    throw new Error(`${context} failed (HTTP ${res.status})${detail ? `: ${detail}` : ""}`);
  }
  return (await res.json()) as T;
}

/**
 * Page 1 of threads matching the broker's email address, most recent first
 * (Gmail's default ordering). Returns thread ids only.
 */
export async function listRecentThreads(
  accessToken: string,
  email: string,
  { newerThanDays = 180, max = 25 }: { newerThanDays?: number; max?: number } = {},
): Promise<{ id: string }[]> {
  // Braces are Gmail's OR-group: without them, "a OR b c" parses as
  // "a OR (b AND c)" and the date window wouldn't apply to the from: side.
  const q = `{from:${email} to:${email}} newer_than:${newerThanDays}d`;
  const data = await gmailGet<{ threads?: { id?: string }[] }>(
    accessToken,
    `/users/me/threads?q=${encodeURIComponent(q)}&maxResults=${max}`,
    "Gmail thread list",
  );
  return (data.threads ?? []).flatMap((t) => (t.id ? [{ id: t.id }] : []));
}

export type ThreadMeta = {
  threadId: string;
  subject: string | null;
  lastMessageAt: string; // ISO timestamp of the thread's last message
  snippet: string;
};

function findHeader(headers: GmailHeader[] | undefined, name: string): string | null {
  const lower = name.toLowerCase();
  return headers?.find((h) => h.name?.toLowerCase() === lower)?.value ?? null;
}

/**
 * Fetch a thread's metadata (never the body). With format=metadata Gmail
 * nests headers two levels deep: each message carries payload.headers as an
 * array of { name, value }. internalDate is a string of epoch millis on the
 * message object. Returns null for threads with no usable messages.
 */
export async function getThreadMeta(accessToken: string, threadId: string): Promise<ThreadMeta | null> {
  const data = await gmailGet<GmailThread>(
    accessToken,
    `/users/me/threads/${threadId}?format=metadata&metadataHeaders=Subject&metadataHeaders=Date`,
    "Gmail thread fetch",
  );

  const messages = data.messages;
  if (!messages || messages.length === 0) return null;
  const last = messages[messages.length - 1];

  // internalDate (epoch ms) on the last message; fall back to its Date header.
  let ms = Number(last.internalDate);
  if (!Number.isFinite(ms) || ms <= 0) {
    ms = Date.parse(findHeader(last.payload?.headers, "Date") ?? "");
  }
  if (!Number.isFinite(ms) || ms <= 0) return null;

  // Subject: last message first (usually "Re: …"), else scan earlier messages.
  let subject = findHeader(last.payload?.headers, "Subject");
  if (subject == null) {
    for (let i = messages.length - 2; i >= 0 && subject == null; i--) {
      subject = findHeader(messages[i].payload?.headers, "Subject");
    }
  }

  return {
    threadId,
    subject,
    lastMessageAt: new Date(ms).toISOString(),
    snippet: last.snippet ?? data.snippet ?? "",
  };
}

// ---------------------------------------------------------------------------
// Sync
// ---------------------------------------------------------------------------

// Gmail snippets are HTML-entity-encoded; decode the common ones minimally.
function decodeEntities(s: string): string {
  const fromCode = (n: number) => (Number.isFinite(n) && n > 0 && n <= 0x10ffff ? String.fromCodePoint(n) : "");
  return s
    .replace(/&#(\d+);/g, (_, d: string) => fromCode(Number(d)))
    .replace(/&#x([0-9a-f]+);/gi, (_, h: string) => fromCode(parseInt(h, 16)))
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&");
}

const SUMMARY_MAX = 500;
const META_BATCH = 5; // small concurrent batches — be gentle on Gmail quota

/**
 * Sync one broker's recent Gmail threads into interactions.
 *
 * Upserts on (broker_id, gmail_thread_id) — the unique index
 * interactions_gmail_thread_unique exists — updating occurred_at/summary so
 * re-syncs refresh threads that received new replies. Inserts bump
 * brokers.last_contact_date via the z_bump_last_contact DB trigger.
 *
 * Returns the number of threads upserted.
 */
export async function syncBrokerGmail(
  db: Db,
  broker: { id: string; email: string },
  accessToken: string,
  opts: { newerThanDays?: number; max?: number } = {},
): Promise<number> {
  const threads = await listRecentThreads(accessToken, broker.email, opts);
  if (threads.length === 0) return 0;

  const rows: InteractionInsert[] = [];
  for (let i = 0; i < threads.length; i += META_BATCH) {
    const metas = await Promise.all(threads.slice(i, i + META_BATCH).map((t) => getThreadMeta(accessToken, t.id)));
    for (const meta of metas) {
      if (!meta) continue;
      const subject = meta.subject?.trim() || "(no subject)";
      const snippet = decodeEntities(meta.snippet).trim();
      const summary = (snippet ? `${subject} — ${snippet}` : subject).slice(0, SUMMARY_MAX);
      rows.push({
        broker_id: broker.id,
        type: "email",
        occurred_at: meta.lastMessageAt,
        summary,
        gmail_thread_id: meta.threadId,
      });
    }
  }
  if (rows.length === 0) return 0;

  // Skip unchanged threads: a blanket upsert would rewrite identical rows and
  // flood the audit log with no-op 'update' entries on every nightly run.
  const { data: existing, error: readError } = await db
    .from("interactions")
    .select("gmail_thread_id, occurred_at, summary")
    .eq("broker_id", broker.id)
    .in(
      "gmail_thread_id",
      rows.map((r) => r.gmail_thread_id!),
    );
  if (readError) throw new Error(`Checking existing Gmail threads: ${readError.message}`);
  const unchanged = new Set(
    (existing ?? [])
      .filter((e) => {
        const row = rows.find((r) => r.gmail_thread_id === e.gmail_thread_id);
        return (
          row &&
          e.summary === row.summary &&
          new Date(e.occurred_at).getTime() === new Date(row.occurred_at!).getTime()
        );
      })
      .map((e) => e.gmail_thread_id),
  );
  const changed = rows.filter((r) => !unchanged.has(r.gmail_thread_id!));
  if (changed.length === 0) return 0;

  const { error } = await db.from("interactions").upsert(changed, { onConflict: "broker_id,gmail_thread_id" });
  if (error) throw new Error(`Saving Gmail threads: ${error.message}`);
  return changed.length;
}
