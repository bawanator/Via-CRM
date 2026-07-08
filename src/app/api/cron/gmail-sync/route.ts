// GET /api/cron/gmail-sync — nightly Google sync (schedule in vercel.json).
// Vercel sends "Authorization: Bearer $CRON_SECRET" automatically when the
// env var is set. Four phases, each independently try/caught so one failing
// never aborts the others:
//
//   1. Reply-triggered contact discovery: scan recent SENT mail and create
//      skeleton contacts (type "Other") for addresses the CRM doesn't know —
//      a contact is only ever created because the user actually wrote to
//      them, so spam never gets in. (gate: ENABLE_GMAIL_DISCOVERY)
//   2. Thread sync across ALL contacts with an email address (not just
//      brokers) — subjects/dates/snippets only, never bodies.
//   3. Google Tasks reconcile: pull Google-side completions into the CRM
//      (with skipGoogleSync so they're not echoed back — loop prevention) and
//      push CRM tasks created while sync was off. A task deleted in Google is
//      deliberately NOT deleted in the CRM. (gate: ENABLE_GOOGLE_TASKS_SYNC)
//   4. Meeting-note prompts: for calendar events that ended in the past 24h
//      with at least one external attendee, create an "Add notes from …" CRM
//      task, linked to the matching contact when an attendee email matches.
//      Idempotent via the unique index on tasks.source_event_id.
//      (gate: ENABLE_MEETING_TASK_PROMPTS)
//
// Bounded work: last 30 days, max 15 threads per contact. Per-contact
// failures are collected, never abort the run; a dead refresh token returns
// 200 with ok:false — logged, graceful, nothing to retry until the user
// re-connects.

import { NextResponse, type NextRequest } from "next/server";
import { todayISO } from "@/lib/dates";
import { createAdminClient } from "@/lib/supabase/admin";
import { discoverContactsFromSent, refreshAccessToken, syncBrokerGmail, type DiscoveryResult } from "@/lib/gmail";
import {
  ensureViaTasklist,
  eventHasEnded,
  externalAttendeeEmails,
  listRecentEvents,
  listTasks as listGoogleTasks,
  meetingTaskTitle,
  reconcileTaskAction,
} from "@/lib/google";
import { completeTask, createTask, pushTaskToGoogle } from "@/lib/crm/tasks";

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
  // per-contact thread sync below. Gated behind ENABLE_GMAIL_DISCOVERY so
  // auto-created contacts only start appearing when explicitly switched on.
  let discovery: DiscoveryResult | { error: string } | { skipped: string };
  if (process.env.ENABLE_GMAIL_DISCOVERY !== "true") {
    discovery = { skipped: "discovery disabled (ENABLE_GMAIL_DISCOVERY != true)" };
  } else
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

  // Phase 3: Google Tasks reconcile — pull completions made in Google
  // (Calendar/Tasks apps) into the CRM, and push any CRM tasks that were
  // created while sync was off. Best-effort, never aborts phase 4.
  type TasksSyncSummary = { completedFromGoogle: number; pushed: number };
  let tasksSync: TasksSyncSummary | { error: string } | { skipped: string };
  if (process.env.ENABLE_GOOGLE_TASKS_SYNC !== "true") {
    tasksSync = { skipped: "tasks sync disabled (ENABLE_GOOGLE_TASKS_SYNC != true)" };
  } else
  try {
    const tasklistId = await ensureViaTasklist(accessToken);
    const googleTasks = await listGoogleTasks(accessToken, tasklistId, { showCompleted: true });
    const googleById = new Map(googleTasks.map((t) => [t.id, t]));

    const { data: crmTasks, error: crmTasksError } = await db
      .from("tasks")
      .select("id, title, completed, google_task_id");
    if (crmTasksError) throw new Error(`Loading CRM tasks: ${crmTasksError.message}`);

    let completedFromGoogle = 0;
    let pushed = 0;
    for (const task of crmTasks ?? []) {
      if (task.google_task_id) {
        // Ticked in Google, still open here → complete in the CRM with
        // skipGoogleSync so the change isn't pushed straight back (loop
        // prevention). A task absent from Google (deleted/cleared there) is
        // left alone — Google deletion ≠ CRM deletion.
        if (reconcileTaskAction(googleById.get(task.google_task_id), task.completed) === "complete-crm") {
          await completeTask(db, task.id, true, { skipGoogleSync: true });
          completedFromGoogle += 1;
        }
      } else if (!task.completed) {
        // Never synced (created while the flag was off): fetch the full row
        // and push it. pushTaskToGoogle is best-effort and never throws.
        const { data: full } = await db.from("tasks").select("*").eq("id", task.id).maybeSingle();
        if (full) {
          await pushTaskToGoogle(db, full);
          pushed += 1;
        }
      }
    }
    tasksSync = { completedFromGoogle, pushed };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Tasks reconcile failed";
    console.error("Cron gmail-sync: Google Tasks reconcile failed:", message);
    tasksSync = { error: message };
  }

  // Phase 4: meeting-note prompts — calendar events that ENDED in the past
  // 24h with at least one external attendee become an "Add notes from …"
  // task. Idempotent: tasks.source_event_id carries a unique partial index,
  // and we pre-check it so nightly re-runs skip already-prompted events.
  type MeetingPromptsSummary = { created: number; skipped: number };
  let meetingPrompts: MeetingPromptsSummary | { error: string } | { skipped: string };
  if (process.env.ENABLE_MEETING_TASK_PROMPTS !== "true") {
    meetingPrompts = { skipped: "meeting prompts disabled (ENABLE_MEETING_TASK_PROMPTS != true)" };
  } else
  try {
    const now = new Date();
    const timeMin = new Date(now.getTime() - 24 * 60 * 60 * 1000).toISOString();
    const events = await listRecentEvents(accessToken, { timeMin, timeMax: now.toISOString() });

    // Only meetings that already ended, and only ones with a real external
    // (non-self, non-viaprivate, non-resource/noreply) attendee.
    const candidates = events
      .filter((event) => eventHasEnded(event, now))
      .map((event) => ({ event, externalEmails: externalAttendeeEmails(event.attendees) }))
      .filter((c) => c.externalEmails.length > 0);

    let created = 0;
    let skipped = 0;
    if (candidates.length > 0) {
      const { data: existingRows, error: existingError } = await db
        .from("tasks")
        .select("source_event_id")
        .in(
          "source_event_id",
          candidates.map((c) => c.event.id),
        );
      if (existingError) throw new Error(`Checking existing meeting tasks: ${existingError.message}`);
      const alreadyPrompted = new Set((existingRows ?? []).map((r) => r.source_event_id));

      // Match attendees to contacts. Attendee emails arrive lowercased from
      // externalAttendeeEmails; comparison against returned rows is
      // case-insensitive. First matching attendee wins.
      const allExternal = [...new Set(candidates.flatMap((c) => c.externalEmails))];
      const { data: contactRows, error: contactError } = await db
        .from("contacts")
        .select("id, email")
        .in("email", allExternal);
      if (contactError) throw new Error(`Matching attendees to contacts: ${contactError.message}`);
      const contactByEmail = new Map(
        (contactRows ?? []).flatMap((c) => (c.email ? [[c.email.toLowerCase(), c.id] as const] : [])),
      );

      const today = todayISO(now); // Sydney calendar day, not UTC — a 3am cron must not date tasks yesterday
      for (const { event, externalEmails } of candidates) {
        if (alreadyPrompted.has(event.id)) {
          skipped += 1;
          continue;
        }
        const contactId = externalEmails.map((e) => contactByEmail.get(e)).find(Boolean) ?? null;
        try {
          // Through createTask so the prompt also pushes to Google Tasks.
          await createTask(db, {
            title: meetingTaskTitle(event.summary),
            notes: `Meeting attendees: ${externalEmails.join(", ")}`,
            due_date: today,
            source_event_id: event.id,
            contact_id: contactId,
          });
          created += 1;
        } catch (err) {
          const message = err instanceof Error ? err.message : "Creating meeting task failed";
          // Unique violation on source_event_id = already prompted (race with
          // a previous run) — that's the idempotency working, count as skip.
          if (/duplicate key|23505|tasks_source_event_unique/i.test(message)) {
            skipped += 1;
          } else {
            console.error(`Cron gmail-sync: meeting prompt for event ${event.id} failed:`, message);
          }
        }
      }
    }
    meetingPrompts = { created, skipped };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Meeting prompts failed";
    console.error("Cron gmail-sync: meeting prompts failed:", message);
    meetingPrompts = { error: message };
  }

  return NextResponse.json({ ok: true, discovery, results, tasksSync, meetingPrompts });
}
