// Google Tasks + Calendar — raw REST via fetch (no googleapis dependency),
// following the src/lib/gmail.ts patterns. Access tokens come from the same
// refreshAccessToken() flow gmail.ts uses.
//
// Scopes: tasks (read/write inside our own "Vía OS" list) and
// calendar.readonly ONLY — events are read to prompt note-taking after
// meetings, never created or modified. We store only what's needed on our
// side: task id, event id, title, date. Event bodies/descriptions are never
// fetched or stored.

import { NOREPLY_RE } from "@/lib/gmail";

const TASKS_BASE = "https://tasks.googleapis.com/tasks/v1";
const CALENDAR_BASE = "https://www.googleapis.com/calendar/v3";

export const VIA_TASKLIST_TITLE = "Vía OS";
export const INTERNAL_DOMAIN = "viaprivate.com.au";

// ---------------------------------------------------------------------------
// Shared fetch helper
// ---------------------------------------------------------------------------

async function googleFetch<T>(
  accessToken: string,
  url: string,
  context: string,
  init: { method?: string; body?: unknown } = {},
): Promise<T> {
  const res = await fetch(url, {
    method: init.method ?? "GET",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      ...(init.body !== undefined ? { "Content-Type": "application/json" } : {}),
    },
    ...(init.body !== undefined ? { body: JSON.stringify(init.body) } : {}),
  });
  if (!res.ok) {
    const body = (await res.json().catch(() => null)) as { error?: { message?: string; status?: string } } | null;
    const detail = body?.error?.message ?? body?.error?.status ?? "";
    throw new Error(`${context} failed (HTTP ${res.status})${detail ? `: ${detail}` : ""}`);
  }
  // DELETE returns 204 with an empty body.
  if (res.status === 204) return undefined as T;
  const text = await res.text();
  return (text ? JSON.parse(text) : undefined) as T;
}

// ---------------------------------------------------------------------------
// Google Tasks
// ---------------------------------------------------------------------------

export type GoogleTaskStatus = "needsAction" | "completed";

export type GoogleTask = {
  id: string;
  title: string;
  status: GoogleTaskStatus;
  due: string | null; // RFC3339 (date part only is meaningful to Google Tasks)
  updated: string | null;
};

/** CRM due_date (YYYY-MM-DD) → the RFC3339 form Google Tasks expects (00:00Z). */
export function dueDateToRfc3339(dueDate: string): string {
  return `${dueDate}T00:00:00.000Z`;
}

type RawGoogleTask = { id?: string; title?: string; status?: string; due?: string; updated?: string };

function toGoogleTask(raw: RawGoogleTask): GoogleTask | null {
  if (!raw.id) return null;
  return {
    id: raw.id,
    title: raw.title ?? "",
    status: raw.status === "completed" ? "completed" : "needsAction",
    due: raw.due ?? null,
    updated: raw.updated ?? null,
  };
}

// Tasklist-id cache keyed by access token: per warm lambda instance, one
// find-or-create round-trip per token lifetime (~1h). Bounded — tokens rotate,
// so clear rather than grow.
const tasklistCache = new Map<string, string>();
const TASKLIST_CACHE_MAX = 20;

/** Find (or create) the dedicated "Vía OS" tasklist and return its id. */
export async function ensureViaTasklist(accessToken: string): Promise<string> {
  const cached = tasklistCache.get(accessToken);
  if (cached) return cached;

  const data = await googleFetch<{ items?: { id?: string; title?: string }[] }>(
    accessToken,
    `${TASKS_BASE}/users/@me/lists?maxResults=100`,
    "Google tasklist list",
  );
  let id = data.items?.find((l) => l.title === VIA_TASKLIST_TITLE)?.id;

  if (!id) {
    const created = await googleFetch<{ id?: string }>(
      accessToken,
      `${TASKS_BASE}/users/@me/lists`,
      "Google tasklist create",
      { method: "POST", body: { title: VIA_TASKLIST_TITLE } },
    );
    id = created.id;
  }
  if (!id) throw new Error("Google tasklist find-or-create returned no id");

  if (tasklistCache.size >= TASKLIST_CACHE_MAX) tasklistCache.clear();
  tasklistCache.set(accessToken, id);
  return id;
}

/** Insert a task into the given tasklist; returns the new Google task id. */
export async function insertTask(
  accessToken: string,
  tasklistId: string,
  input: { title: string; notes?: string; due?: string; status?: GoogleTaskStatus },
): Promise<string> {
  const created = await googleFetch<{ id?: string }>(
    accessToken,
    `${TASKS_BASE}/lists/${encodeURIComponent(tasklistId)}/tasks`,
    "Google task insert",
    { method: "POST", body: input },
  );
  if (!created.id) throw new Error("Google task insert returned no id");
  return created.id;
}

/** Patch a task (partial update). `due: null` clears the due date. */
export async function patchTask(
  accessToken: string,
  tasklistId: string,
  taskId: string,
  input: { title?: string; due?: string | null; status?: GoogleTaskStatus },
): Promise<void> {
  // Reopening a completed Google task requires clearing its `completed`
  // timestamp alongside the status flip.
  const body: Record<string, unknown> = { ...input };
  if (input.status === "needsAction") body.completed = null;
  await googleFetch<unknown>(
    accessToken,
    `${TASKS_BASE}/lists/${encodeURIComponent(tasklistId)}/tasks/${encodeURIComponent(taskId)}`,
    "Google task patch",
    { method: "PATCH", body },
  );
}

export async function deleteTask(accessToken: string, tasklistId: string, taskId: string): Promise<void> {
  await googleFetch<unknown>(
    accessToken,
    `${TASKS_BASE}/lists/${encodeURIComponent(tasklistId)}/tasks/${encodeURIComponent(taskId)}`,
    "Google task delete",
    { method: "DELETE" },
  );
}

/**
 * All tasks in a list, for reconciliation. showHidden is on whenever
 * showCompleted is: Google marks tasks completed in its own UI as hidden,
 * and without it completions would be invisible to the cron.
 */
export async function listTasks(
  accessToken: string,
  tasklistId: string,
  { showCompleted = true, updatedMin }: { showCompleted?: boolean; updatedMin?: string } = {},
): Promise<GoogleTask[]> {
  const out: GoogleTask[] = [];
  let pageToken: string | undefined;
  do {
    const params = new URLSearchParams({ maxResults: "100" });
    if (showCompleted) {
      params.set("showCompleted", "true");
      params.set("showHidden", "true");
    }
    if (updatedMin) params.set("updatedMin", updatedMin);
    if (pageToken) params.set("pageToken", pageToken);
    const data = await googleFetch<{ items?: RawGoogleTask[]; nextPageToken?: string }>(
      accessToken,
      `${TASKS_BASE}/lists/${encodeURIComponent(tasklistId)}/tasks?${params}`,
      "Google task list",
    );
    for (const raw of data.items ?? []) {
      const task = toGoogleTask(raw);
      if (task) out.push(task);
    }
    pageToken = data.nextPageToken;
  } while (pageToken);
  return out;
}

// ---------------------------------------------------------------------------
// Google Calendar (read-only)
// ---------------------------------------------------------------------------

export type EventAttendee = {
  email?: string;
  displayName?: string;
  responseStatus?: string;
  self?: boolean;
  organizer?: boolean;
  resource?: boolean;
};

export type EventTime = { dateTime?: string; date?: string };

export type CalendarEvent = {
  id: string;
  summary: string;
  start: EventTime;
  end: EventTime;
  attendees: EventAttendee[];
};

/**
 * Events on the primary calendar in [timeMin, timeMax], recurring series
 * expanded (singleEvents) and ordered by start. Read-only; we keep id,
 * summary, start/end and attendee emails only.
 */
export async function listRecentEvents(
  accessToken: string,
  { timeMin, timeMax }: { timeMin: string; timeMax: string },
): Promise<CalendarEvent[]> {
  const out: CalendarEvent[] = [];
  let pageToken: string | undefined;
  do {
    const params = new URLSearchParams({
      timeMin,
      timeMax,
      singleEvents: "true",
      orderBy: "startTime",
      maxResults: "100",
    });
    if (pageToken) params.set("pageToken", pageToken);
    const data = await googleFetch<{
      items?: {
        id?: string;
        summary?: string;
        status?: string;
        start?: EventTime;
        end?: EventTime;
        attendees?: EventAttendee[];
      }[];
      nextPageToken?: string;
    }>(accessToken, `${CALENDAR_BASE}/calendars/primary/events?${params}`, "Google calendar list");
    for (const item of data.items ?? []) {
      if (!item.id || item.status === "cancelled") continue;
      out.push({
        id: item.id,
        summary: item.summary ?? "",
        start: item.start ?? {},
        end: item.end ?? {},
        attendees: item.attendees ?? [],
      });
    }
    pageToken = data.nextPageToken;
  } while (pageToken);
  return out;
}

// ---------------------------------------------------------------------------
// Pure decision helpers (exported for tests — no network, no state)
// ---------------------------------------------------------------------------

/**
 * An attendee that should trigger a meeting-note prompt: a real external
 * human. Excludes the user themself, anyone on the internal domain, Google
 * resource/room addresses (…@resource.calendar.google.com and the like) and
 * noreply-style robot mailboxes.
 */
export function isExternalAttendee(attendee: EventAttendee, internalDomain: string = INTERNAL_DOMAIN): boolean {
  const email = attendee.email?.trim().toLowerCase();
  if (!email || !email.includes("@")) return false;
  if (attendee.self) return false;
  if (attendee.resource) return false;
  const domain = email.split("@")[1];
  if (domain === internalDomain.toLowerCase()) return false;
  if (domain.endsWith("resource.calendar.google.com")) return false;
  if (domain.endsWith("group.calendar.google.com") || domain.endsWith("group.v.calendar.google.com")) return false;
  if (NOREPLY_RE.test(email)) return false;
  return true;
}

/** Deduped, lowercased emails of the external attendees of an event. */
export function externalAttendeeEmails(
  attendees: EventAttendee[] | undefined,
  internalDomain: string = INTERNAL_DOMAIN,
): string[] {
  const out = new Set<string>();
  for (const attendee of attendees ?? []) {
    if (isExternalAttendee(attendee, internalDomain)) out.add(attendee.email!.trim().toLowerCase());
  }
  return [...out];
}

/** Title for the auto-created meeting-note task. */
export function meetingTaskTitle(summary: string | null | undefined): string {
  const trimmed = summary?.trim();
  return trimmed ? `Add notes from “${trimmed}”` : "Add notes from your meeting";
}

/** True once the event's end time is in the past (all-day ends at 00:00Z of its exclusive end date). */
export function eventHasEnded(event: { end: EventTime }, now: Date): boolean {
  const raw = event.end.dateTime ?? (event.end.date ? `${event.end.date}T00:00:00.000Z` : null);
  if (!raw) return false;
  const ms = Date.parse(raw);
  return Number.isFinite(ms) && ms <= now.getTime();
}

export type ReconcileAction = "complete-crm" | "none";

/**
 * One row of the reconcile decision table:
 * - Google task completed while the CRM task is still open → complete in CRM.
 * - Google task missing from the list (deleted/cleared in Google) → no-op:
 *   a Google-side deletion is never treated as a CRM deletion.
 * - Everything else (both open, both done, Google open + CRM done) → no-op;
 *   CRM-side completions were already pushed at write time.
 */
export function reconcileTaskAction(
  googleTask: Pick<GoogleTask, "status"> | undefined,
  crmCompleted: boolean,
): ReconcileAction {
  if (!googleTask) return "none";
  if (googleTask.status === "completed" && !crmCompleted) return "complete-crm";
  return "none";
}
