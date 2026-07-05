// GET /api/cron/gmail-sync — nightly Gmail sync across all brokers with an
// email address (schedule in vercel.json). Vercel sends
// "Authorization: Bearer $CRON_SECRET" automatically when the env var is set.
//
// Bounded work: last 30 days, max 15 threads per broker. Per-broker failures
// are collected, never abort the run; a dead refresh token returns 200 with
// ok:false — logged, graceful, nothing to retry until the user re-connects.

import { NextResponse, type NextRequest } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { refreshAccessToken, syncBrokerGmail } from "@/lib/gmail";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

const NIGHTLY_NEWER_THAN_DAYS = 30;
const NIGHTLY_MAX_THREADS = 15;

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

  const { data: brokers, error: brokersError } = await db
    .from("contacts")
    .select("id, email")
    .not("email", "is", null)
    .order("full_name");
  if (brokersError) {
    return NextResponse.json({ ok: false, error: `Loading brokers: ${brokersError.message}` }, { status: 500 });
  }

  const results: CronResult[] = [];
  for (const broker of brokers ?? []) {
    if (!broker.email) continue;
    try {
      const synced = await syncBrokerGmail(db, { id: broker.id, email: broker.email }, accessToken, {
        newerThanDays: NIGHTLY_NEWER_THAN_DAYS,
        max: NIGHTLY_MAX_THREADS,
      });
      results.push({ brokerId: broker.id, synced });
    } catch (err) {
      const message = err instanceof Error ? err.message : "Sync failed";
      console.error(`Cron gmail-sync: broker ${broker.id} failed:`, message);
      results.push({ brokerId: broker.id, error: message });
    }
  }

  return NextResponse.json({ ok: true, results });
}
