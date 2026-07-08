// Pure-logic tests for the Google Tasks/Calendar sync (src/lib/google.ts) —
// no network, no Supabase. The REST helpers themselves are thin fetch
// wrappers; everything decision-shaped is exported as a pure function and
// pinned here: the external-attendee filter, due-date mapping, the
// meeting-task title fallback, ended-event detection, and the reconcile
// decision table (which is where loop prevention lives).
import { describe, expect, it } from "vitest";
import {
  dueDateToRfc3339,
  eventHasEnded,
  externalAttendeeEmails,
  isExternalAttendee,
  meetingTaskTitle,
  reconcileTaskAction,
} from "@/lib/google";

describe("isExternalAttendee", () => {
  it("accepts a plain external human", () => {
    expect(isExternalAttendee({ email: "jono@avant.org.au" })).toBe(true);
    expect(isExternalAttendee({ email: "sam@example.com", responseStatus: "accepted" })).toBe(true);
  });

  it("excludes the user themself (self flag), even on an external-looking address", () => {
    expect(isExternalAttendee({ email: "harry@viaprivate.com.au", self: true })).toBe(false);
    expect(isExternalAttendee({ email: "hargobindbawa@gmail.com", self: true })).toBe(false);
  });

  it("excludes anyone on the internal domain, case-insensitively", () => {
    expect(isExternalAttendee({ email: "harry@viaprivate.com.au" })).toBe(false);
    expect(isExternalAttendee({ email: "Someone@ViaPrivate.com.au" })).toBe(false);
  });

  it("does not treat a subdomain-squatting lookalike as internal", () => {
    expect(isExternalAttendee({ email: "x@notviaprivate.com.au" })).toBe(true);
  });

  it("excludes Google resource/room addresses", () => {
    expect(isExternalAttendee({ email: "c_1888@resource.calendar.google.com" })).toBe(false);
    expect(isExternalAttendee({ email: "room-4@company.resource.calendar.google.com", resource: true })).toBe(false);
    // The resource flag alone is enough even without the giveaway domain.
    expect(isExternalAttendee({ email: "boardroom@avant.org.au", resource: true })).toBe(false);
  });

  it("excludes calendar-generated group addresses and noreply-style robots", () => {
    expect(isExternalAttendee({ email: "abc123@group.calendar.google.com" })).toBe(false);
    expect(isExternalAttendee({ email: "no-reply@zoom.us" })).toBe(false);
    expect(isExternalAttendee({ email: "notifications@calendly.com" })).toBe(false);
  });

  it("rejects missing or junk emails", () => {
    expect(isExternalAttendee({})).toBe(false);
    expect(isExternalAttendee({ email: "" })).toBe(false);
    expect(isExternalAttendee({ email: "not-an-email" })).toBe(false);
  });
});

describe("externalAttendeeEmails", () => {
  it("returns no prompt candidates for events without attendees", () => {
    expect(externalAttendeeEmails(undefined)).toEqual([]);
    expect(externalAttendeeEmails([])).toEqual([]);
  });

  it("returns empty for an internal-only meeting (self + colleagues + room)", () => {
    expect(
      externalAttendeeEmails([
        { email: "harry@viaprivate.com.au", self: true, organizer: true },
        { email: "ops@viaprivate.com.au" },
        { email: "c_188@resource.calendar.google.com", resource: true },
      ]),
    ).toEqual([]);
  });

  it("keeps only the externals, lowercased and deduped", () => {
    expect(
      externalAttendeeEmails([
        { email: "harry@viaprivate.com.au", self: true },
        { email: "Jono@Avant.org.au", displayName: "Jono Yacoub" },
        { email: "jono@avant.org.au" },
        { email: "sam@example.com" },
      ]),
    ).toEqual(["jono@avant.org.au", "sam@example.com"]);
  });
});

describe("dueDateToRfc3339", () => {
  it("maps a CRM due_date to midnight-UTC RFC3339, as Google Tasks expects", () => {
    expect(dueDateToRfc3339("2026-07-08")).toBe("2026-07-08T00:00:00.000Z");
    expect(dueDateToRfc3339("2024-02-29")).toBe("2024-02-29T00:00:00.000Z");
  });
});

describe("meetingTaskTitle", () => {
  it("quotes the event summary", () => {
    expect(meetingTaskTitle("Coffee with Jono")).toBe("Add notes from “Coffee with Jono”");
  });

  it("trims whitespace-y summaries before quoting", () => {
    expect(meetingTaskTitle("  Coffee with Jono  ")).toBe("Add notes from “Coffee with Jono”");
  });

  it("falls back to 'your meeting' when the summary is empty", () => {
    expect(meetingTaskTitle("")).toBe("Add notes from your meeting");
    expect(meetingTaskTitle("   ")).toBe("Add notes from your meeting");
    expect(meetingTaskTitle(null)).toBe("Add notes from your meeting");
    expect(meetingTaskTitle(undefined)).toBe("Add notes from your meeting");
  });
});

describe("eventHasEnded", () => {
  const now = new Date("2026-07-08T10:00:00.000Z");

  it("is true for a meeting that finished, false for one still running or upcoming", () => {
    expect(eventHasEnded({ end: { dateTime: "2026-07-08T09:30:00Z" } }, now)).toBe(true);
    expect(eventHasEnded({ end: { dateTime: "2026-07-08T10:30:00Z" } }, now)).toBe(false);
  });

  it("treats an all-day event's exclusive end date as midnight UTC", () => {
    expect(eventHasEnded({ end: { date: "2026-07-08" } }, now)).toBe(true); // ended at 00:00Z today
    expect(eventHasEnded({ end: { date: "2026-07-09" } }, now)).toBe(false); // still running
  });

  it("never fires for events with no usable end time", () => {
    expect(eventHasEnded({ end: {} }, now)).toBe(false);
    expect(eventHasEnded({ end: { dateTime: "garbage" } }, now)).toBe(false);
  });
});

describe("reconcileTaskAction (decision table)", () => {
  it("google completed + crm open → complete the CRM task", () => {
    expect(reconcileTaskAction({ status: "completed" }, false)).toBe("complete-crm");
  });

  it("google completed + crm already complete → no-op", () => {
    expect(reconcileTaskAction({ status: "completed" }, true)).toBe("none");
  });

  it("google still open → no-op regardless of CRM state (CRM changes push at write time)", () => {
    expect(reconcileTaskAction({ status: "needsAction" }, false)).toBe("none");
    expect(reconcileTaskAction({ status: "needsAction" }, true)).toBe("none");
  });

  it("google task absent (deleted/cleared in Google) → no-op, never a CRM deletion", () => {
    expect(reconcileTaskAction(undefined, false)).toBe("none");
    expect(reconcileTaskAction(undefined, true)).toBe("none");
  });
});
