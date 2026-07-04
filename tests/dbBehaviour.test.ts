// Behavioural tests against a REAL local Supabase stack — the invariants that
// live in the database (triggers), not in app code. Skipped entirely unless
// the env vars below are set, so `npm test` stays green without Docker.
//
// How to run:
//   npx supabase start        # boots local Postgres/PostgREST, applies supabase/migrations
//   TEST_SUPABASE_URL=http://127.0.0.1:54321 \
//   TEST_SUPABASE_SERVICE_ROLE_KEY=<service_role key from `npx supabase status`> \
//   npm test
//
// Uses a service-role client (bypasses RLS, no auth user) with no
// x-change-source header, so audit rows must land with source 'system'.
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Database } from "@/lib/database.types";
import { diffAuditEntry } from "@/lib/crm/audit";

const url = process.env.TEST_SUPABASE_URL;
const serviceRoleKey = process.env.TEST_SUPABASE_SERVICE_ROLE_KEY;
const enabled = Boolean(url && serviceRoleKey);

function must<T>(data: T | null, error: { message: string } | null): T {
  if (error) throw new Error(error.message);
  if (data === null) throw new Error("Expected a row back, got null");
  return data;
}

const runSuffix = `${Date.now()}-${Math.floor(Math.random() * 1e6)}`;

describe.skipIf(!enabled)("database behaviour (local Supabase)", () => {
  let db: SupabaseClient<Database>;
  // Everything created here gets tracked so afterAll can clean up — data rows
  // first, then the audit rows those rows (and their deletion) produced.
  const brokerIds: string[] = [];
  const dealIds: string[] = [];
  const interactionIds: string[] = [];
  const allRecordIds: string[] = [];

  async function createBroker(fullName: string) {
    const { data, error } = await db
      .from("brokers")
      .insert({ full_name: fullName, source: "vitest" })
      .select()
      .single();
    const broker = must(data, error);
    brokerIds.push(broker.id);
    allRecordIds.push(broker.id);
    return broker;
  }

  beforeAll(() => {
    db = createClient<Database>(url!, serviceRoleKey!, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
  });

  afterAll(async () => {
    if (interactionIds.length) await db.from("interactions").delete().in("id", interactionIds);
    if (dealIds.length) await db.from("deals").delete().in("id", dealIds);
    if (brokerIds.length) await db.from("brokers").delete().in("id", brokerIds);
    // Deleting the rows above wrote further audit entries; purge them last.
    if (allRecordIds.length) await db.from("audit_log").delete().in("record_id", allRecordIds);
  });

  it("audit trigger writes insert/update/delete rows with before/after and source 'system'", async () => {
    const broker = await createBroker(`Audit Trail Broker ${runSuffix}`);

    const { data: updatedData, error: updateError } = await db
      .from("brokers")
      .update({ stage: "engaged" })
      .eq("id", broker.id)
      .select()
      .single();
    expect(must(updatedData, updateError).stage).toBe("engaged");

    const { error: deleteError } = await db.from("brokers").delete().eq("id", broker.id);
    expect(deleteError).toBeNull();

    const { data: audit, error } = await db
      .from("audit_log")
      .select("*")
      .eq("table_name", "brokers")
      .eq("record_id", broker.id)
      .order("changed_at", { ascending: true });
    const rows = must(audit, error);

    expect(rows.map((r) => r.action)).toEqual(["insert", "update", "delete"]);
    expect(rows.every((r) => r.source === "system")).toBe(true);

    const [inserted, updatedRow, deleted] = rows;
    expect(inserted.before).toBeNull();
    expect(inserted.after?.full_name).toBe(broker.full_name);

    // Field diff of the update: exactly the stage change; row-meta churn
    // (updated_at) must not appear.
    const changes = diffAuditEntry(updatedRow);
    expect(changes).toEqual([{ field: "stage", before: "introduced", after: "engaged" }]);

    expect(deleted.after).toBeNull();
    expect(deleted.before?.id).toBe(broker.id);
    expect(deleted.before?.stage).toBe("engaged");
  });

  it("maturity trigger derives, recomputes, and respects an explicit override", async () => {
    const broker = await createBroker(`Maturity Broker ${runSuffix}`);

    // Insert: maturity derived with Postgres month-clamping (Jan 31 + 1 → Feb 28).
    const { data, error } = await db
      .from("deals")
      .insert({
        name: `Maturity Deal ${runSuffix}`,
        broker_id: broker.id,
        settlement_date: "2025-01-31",
        loan_term_months: 1,
      })
      .select()
      .single();
    const deal = must(data, error);
    dealIds.push(deal.id);
    allRecordIds.push(deal.id);
    expect(deal.maturity_date).toBe("2025-02-28");

    // Term change without touching maturity → trigger recomputes (Jan 31 + 2 → Mar 31).
    const { data: recomputed, error: e2 } = await db
      .from("deals")
      .update({ loan_term_months: 2 })
      .eq("id", deal.id)
      .select()
      .single();
    expect(must(recomputed, e2).maturity_date).toBe("2025-03-31");

    // Explicit maturity override in the SAME update as a term change wins
    // (extension scenario) — the trigger must not clobber it.
    const { data: overridden, error: e3 } = await db
      .from("deals")
      .update({ loan_term_months: 3, maturity_date: "2026-06-30" })
      .eq("id", deal.id)
      .select()
      .single();
    expect(must(overridden, e3).maturity_date).toBe("2026-06-30");
  });

  it("bump_last_contact sets last_contact_date and never regresses it", async () => {
    const broker = await createBroker(`Last Contact Broker ${runSuffix}`);
    expect(broker.last_contact_date).toBeNull();

    // Back-dated interaction → last_contact_date lands on that (UTC) date.
    const { data: first, error: e1 } = await db
      .from("interactions")
      .insert({
        broker_id: broker.id,
        type: "call",
        summary: "Back-dated call",
        occurred_at: "2025-03-10T12:00:00Z",
      })
      .select()
      .single();
    const firstInteraction = must(first, e1);
    interactionIds.push(firstInteraction.id);
    allRecordIds.push(firstInteraction.id);

    const { data: afterFirst, error: e2 } = await db
      .from("brokers")
      .select("last_contact_date")
      .eq("id", broker.id)
      .single();
    expect(must(afterFirst, e2).last_contact_date).toBe("2025-03-10");

    // An OLDER interaction must not pull the date backwards.
    const { data: second, error: e3 } = await db
      .from("interactions")
      .insert({
        broker_id: broker.id,
        type: "email",
        summary: "Even older email",
        occurred_at: "2025-01-05T12:00:00Z",
      })
      .select()
      .single();
    const secondInteraction = must(second, e3);
    interactionIds.push(secondInteraction.id);
    allRecordIds.push(secondInteraction.id);

    const { data: afterSecond, error: e4 } = await db
      .from("brokers")
      .select("last_contact_date")
      .eq("id", broker.id)
      .single();
    expect(must(afterSecond, e4).last_contact_date).toBe("2025-03-10");
  });
});
