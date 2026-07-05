// GET /api/cron/gmail-sync — nightly Gmail sync (schedule in vercel.json).
// Vercel sends "Authorization: Bearer $CRON_SECRET" automatically when the
// env var is set. Two phases:
//
//   1. Reply-triggered contact discovery: scan recent SENT mail and create
//      skeleton contacts (type "Other") for addresses the CRM doesn't know —
//      a contact is only ever created because the user actually wrote to
//      them, so spam never gets in. Wrapped in try/catch: a discovery
//      failure never aborts phase 2.
//   2. Thread sync across ALL contacts with an email address (not just
//      brokers) — subjects/dates/snippets only, never bodies.
//
// Bounded work: last 30 days, max 15 threads per contact. Per-contact
// failures are collected, never abort the run; a dead refresh token returns
// 200 with ok:false — logged, graceful, nothing to retry until the user
// re-connects.

import { NextResponse, type NextRequest } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { discoverContactsFromSent, refreshAccessToken, syncBrokerGmail, type DiscoveryResult } from "@/lib/gmail";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

const NIGHTLY_NEWER_THAN_DAYS = 30;
const NIGHTLY_MAX_THREADS = 15;
const DISCOVERY_MAX_MESSAGES = 50;

type CronResult = { brokerId: string; synced: number } | { brokerId: string; error: string };

export async function GET(request: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret || request.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  const db = createAdminClient("system");

  // Single-user v1: one operator, one Google account — take the first token row.
  const { data: tokens, error: tokenError } = await db.from("google_oauth_tokens").select("refresh_token").limit(1);
  if (tokenError) {
    return NextResponse.json({ ok: false, error: `Loading Google token: ${tokenError.message}` }, { status: 500 });
  }
  const token = tokens?.[0];
  if (!token) {
    return NextResponse.json({ ok: true, skipped: "no google token" });
  }

  let accessToken: string;
  try {
    accessToken = await refreshAccessToken(token.refresh_token);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Google token refresh failed";
    console.error("Cron gmail-sync: token refresh failed:", message);
    return NextResponse.json({ ok: false, error: message });
  }

  // Phase 1: reply-triggered contact discovery. Never allowed to abort the
  // per-contact thread sync below.
  let discovery: DiscoveryResult | { error: string };
  try {
    discovery = await discoverContactsFromSent(db, accessToken, {
      newerThanDays: NIGHTLY_NEWER_THAN_DAYS,
      max: DISCOVERY_MAX_MESSAGES,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Discovery failed";
    console.error("Cron gmail-sync: sent-mail discovery failed:", message);
    discovery = { error: message };
  }

  // Phase 2: thread sync for ALL contacts with an email address — any newly
  // discovered contacts are already covered inside discoverContactsFromSent,
  // and this re-query naturally includes them too.
  const { data: contacts, error: contactsError } = await db
    .from("contacts")
    .select("id, email")
    .not("email", "is", null)
    .order("full_name");
  if (contactsError) {
    return NextResponse.json({ ok: false, error: `Loading contacts: ${contactsError.message}` }, { status: 500 });
  }

  const results: CronResult[] = [];
  for (const contact of contacts ?? []) {
    if (!contact.email) continue;
    try {
      const synced = await syncBrokerGmail(db, { id: contact.id, email: contact.email }, accessToken, {
        newerThanDays: NIGHTLY_NEWER_THAN_DAYS,
        max: NIGHTLY_MAX_THREADS,
      });
      results.push({ brokerId: contact.id, synced });
    } catch (err) {
      const message = err instanceof Error ? err.message : "Sync failed";
      console.error(`Cron gmail-sync: contact ${contact.id} failed:`, message);
      results.push({ brokerId: contact.id, error: message });
    }
  }

  return NextResponse.json({ ok: true, discovery, results });
}
