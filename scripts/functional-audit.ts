// End-to-end functional audit of the crm layer — the ONE write path shared by
// the UI server actions, the MCP server, the nightly cron and every script.
// Creates clearly-marked test records against the live database, exercises
// every operation and DB trigger, verifies the results, then deletes
// everything it created (including its own audit-log noise).
//
//   npx tsx scripts/functional-audit.ts
//
// Also checks the Google integrations READ-ONLY (token refresh, Gmail list,
// Tasks list, Calendar list) — no Google writes, no discovery, no sync.
import { config } from "dotenv";
import { createAdminClient } from "../src/lib/supabase/admin";
import { addMonthsClamped, todayISO } from "../src/lib/dates";
import {
  createContact,
  deleteContact,
  getContact,
  listBrokers,
  resolveContactId,
  updateContact,
} from "../src/lib/crm/contacts";
import { deleteCompany, ensureCompanyByName, getCompany } from "../src/lib/crm/companies";
import {
  createDeal,
  deleteDeal,
  getDeal,
  loseDeal,
  moveDealStage,
  reopenDeal,
  settleDeal,
  updateDeal,
} from "../src/lib/crm/deals";
import { addGuarantor, deleteGuarantor, listGuarantors, updateGuarantor } from "../src/lib/crm/guarantors";
import { addSecurity, deleteSecurity, listSecurities, updateSecurity } from "../src/lib/crm/securities";
import { addKeyDate, completeKeyDate, listUpcomingKeyDates } from "../src/lib/crm/keyDates";
import { addDriveLink, deleteDriveLink, listDriveLinks } from "../src/lib/crm/driveLinks";
import { logInteraction } from "../src/lib/crm/interactions";
import { completeTask, createTask, deleteTask } from "../src/lib/crm/tasks";
import { runReport, type ReportMetric } from "../src/lib/crm/reports";
import { searchAll } from "../src/lib/crm/search";
import { whatsDue } from "../src/lib/crm/today";
import { overviewStats } from "../src/lib/crm/overview";
import { driveLinkInputSchema, dealUpdateSchema } from "../src/lib/schemas";
import { countSentSince, refreshAccessToken } from "../src/lib/gmail";
import { ensureViaTasklist, listRecentEvents, listTasks as listGoogleTasks } from "../src/lib/google";
import { sydneyMidnightEpoch } from "../src/lib/dates";

config({ path: ".env.local", quiet: true });

const MARK = "ZZ-AUDIT";
let pass = 0;
let fail = 0;
const failures: string[] = [];

function check(name: string, ok: boolean, detail = "") {
  if (ok) {
    pass++;
    console.log(`  ✓ ${name}`);
  } else {
    fail++;
    failures.push(name + (detail ? ` — ${detail}` : ""));
    console.log(`  ✗ ${name}${detail ? ` — ${detail}` : ""}`);
  }
}

async function expectThrow(name: string, fn: () => Promise<unknown>, pattern?: RegExp) {
  try {
    await fn();
    check(name, false, "expected an error, got none");
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    check(name, pattern ? pattern.test(msg) : true, msg);
  }
}

// Remove every record this audit ever created (idempotent — also mops up
// after a crashed earlier run), including their audit-log rows.
async function scrub(db: ReturnType<typeof createAdminClient>, extraIds: string[] = []) {
  const ids = [...extraIds];
  for (const table of ["deals", "contacts", "companies"] as const) {
    const nameCol = table === "contacts" ? "full_name" : "name";
    const { data } = await db.from(table).select("id").ilike(nameCol, `${MARK}%`);
    for (const row of data ?? []) ids.push(row.id);
    if (data?.length) await db.from(table).delete().in("id", data.map((r) => r.id));
  }
  const { data: tasks } = await db.from("tasks").select("id").ilike("title", `${MARK}%`);
  for (const row of tasks ?? []) ids.push(row.id);
  if (tasks?.length) await db.from("tasks").delete().in("id", tasks.map((r) => r.id));
  const valid = ids.filter(Boolean);
  if (valid.length) await db.from("audit_log").delete().in("record_id", valid);
}

async function main() {
  const db = createAdminClient("system");
  const today = todayISO();
  const createdIds: string[] = [];
  await scrub(db); // clear any leftovers from a previous crashed run

  try {
    // --- Companies ----------------------------------------------------------
    console.log("Companies:");
    const companyId = await ensureCompanyByName(db, `${MARK} Test Co`);
    if (!companyId) throw new Error("ensureCompanyByName returned null");
    createdIds.push(companyId);
    check("ensureCompanyByName creates", true);
    const companyAgain = await ensureCompanyByName(db, `${MARK} test CO`); // case-insensitive dedupe
    check("ensureCompanyByName dedupes case-insensitively", companyAgain === companyId);

    // --- Contacts ------------------------------------------------------------
    console.log("Contacts:");
    const contact = await createContact(db, {
      full_name: `${MARK} Broker`,
      type: "Broker",
      email: "zz.audit@example.com",
      company_id: companyId,
      stage: "introduced",
    });
    createdIds.push(contact.id);
    check("createContact", contact.full_name === `${MARK} Broker`);
    const updated = await updateContact(db, contact.id, { location: "Sydney", stage: "engaged" });
    check("updateContact (location + stage)", updated.location === "Sydney" && updated.stage === "engaged");
    check("resolveContactId by name", (await resolveContactId(db, `${MARK} Broker`)) === contact.id);
    check("last_contact_date starts null", updated.last_contact_date === null);

    // --- Interactions + bump_last_contact trigger ---------------------------
    console.log("Interactions:");
    const interaction = await logInteraction(db, {
      broker_id: contact.id,
      type: "call",
      summary: `${MARK} call`,
      occurred_at: new Date().toISOString(),
    });
    createdIds.push(interaction.id);
    const afterCall = await getContact(db, contact.id);
    check("bump_last_contact sets Sydney today", afterCall?.last_contact_date === today, String(afterCall?.last_contact_date));

    // --- Deals + triggers ----------------------------------------------------
    console.log("Deals:");
    const deal = await createDeal(db, {
      name: `${MARK} Deal`,
      broker_id: contact.id,
      loan_amount: 1000000,
      product: "bridging",
      funder: "funder_1",
    });
    createdIds.push(deal.id);
    check("createDeal defaults live/scenario", deal.status === "live" && deal.pipeline_stage === "scenario");

    const moved = await moveDealStage(db, deal.id, "docs");
    check("moveDealStage", moved.pipeline_stage === "docs");

    const patch = dealUpdateSchema.parse({ notes: `${MARK} notes save` });
    const noted = await updateDeal(db, deal.id, patch);
    check("deal notes save (Harry's report path)", noted.notes === `${MARK} notes save`);

    const settled = await settleDeal(db, deal.id, today, 12);
    check("settleDeal → maturity trigger", settled.maturity_date === addMonthsClamped(today, 12), String(settled.maturity_date));
    check("settleDeal → closed_at trigger", settled.closed_at !== null);

    const reopened = await reopenDeal(db, deal.id);
    check("reopenDeal clears closed_at", reopened.status === "live" && reopened.closed_at === null);

    const lost = await loseDeal(db, deal.id, "ghosted");
    check("loseDeal sets reason + closed_at", lost.loss_reason === "ghosted" && lost.closed_at !== null);
    const relive = await reopenDeal(db, deal.id);
    check("reopen after lost clears loss_reason", relive.loss_reason === null && relive.status === "live");

    const brokerStats = (await listBrokers(db)).find((b) => b.id === contact.id);
    check("broker_stats view counts the deal", brokerStats?.total_deals_submitted === 1 && brokerStats?.live_deal_count === 1);

    // --- Guarantors (max 3) --------------------------------------------------
    console.log("Guarantors:");
    const g1 = await addGuarantor(db, { deal_id: deal.id, full_name: `${MARK} G1` });
    const g2 = await addGuarantor(db, { deal_id: deal.id, full_name: `${MARK} G2` });
    const g3 = await addGuarantor(db, { deal_id: deal.id, full_name: `${MARK} G3` });
    createdIds.push(g1.id, g2.id, g3.id);
    check("3 guarantors added", (await listGuarantors(db, deal.id)).length === 3);
    await expectThrow("4th guarantor rejected", () => addGuarantor(db, { deal_id: deal.id, full_name: `${MARK} G4` }), /3|max/i);
    const g1u = await updateGuarantor(db, g1.id, { email: "zz.g1@example.com" });
    check("updateGuarantor", g1u.email === "zz.g1@example.com");
    await deleteGuarantor(db, g3.id);
    check("deleteGuarantor", (await listGuarantors(db, deal.id)).length === 2);

    // --- Securities (any number per deal) -------------------------------------
    console.log("Securities:");
    const s1 = await addSecurity(db, { deal_id: deal.id, address: `${MARK} 1 Test St, Sydney` });
    const s2 = await addSecurity(db, { deal_id: deal.id, address: `${MARK} 2 Probe Ave, Melbourne` });
    createdIds.push(s1.id, s2.id);
    check("two securities added", (await listSecurities(db, deal.id)).length === 2);
    const s1u = await updateSecurity(db, s1.id, { address: `${MARK} 1A Test St, Sydney` });
    check("updateSecurity", s1u.address === `${MARK} 1A Test St, Sydney`);
    await deleteSecurity(db, s2.id);
    check("deleteSecurity", (await listSecurities(db, deal.id)).length === 1);

    // --- Key dates -----------------------------------------------------------
    console.log("Key dates:");
    const kd = await addKeyDate(db, { deal_id: deal.id, label: `${MARK} valuation`, due_date: today, remind_days_before: 3 });
    createdIds.push(kd.id);
    const upcoming = await listUpcomingKeyDates(db, 7);
    check("key date appears in upcoming window", upcoming.some((k) => k.id === kd.id));
    const kdDone = await completeKeyDate(db, kd.id, true);
    check("completeKeyDate", kdDone.completed);

    // --- Drive links ---------------------------------------------------------
    console.log("Drive links:");
    const link = await addDriveLink(db, { parent_type: "deal", parent_id: deal.id, label: `${MARK} folder`, url: "https://drive.google.com/x" });
    createdIds.push(link.id);
    check("addDriveLink", (await listDriveLinks(db, "deal", deal.id)).length === 1);
    check(
      "schema rejects javascript: URLs",
      !driveLinkInputSchema.safeParse({ parent_type: "deal", parent_id: deal.id, label: "x", url: "javascript:alert(1)" }).success,
    );
    await deleteDriveLink(db, link.id);
    check("deleteDriveLink", (await listDriveLinks(db, "deal", deal.id)).length === 0);

    // --- Tasks + completed_at trigger (no Google side effects) ---------------
    console.log("Tasks:");
    // createTask's Google push is gated on ENABLE_GOOGLE_TASKS_SYNC, which is
    // unset for local scripts — no stray Google task gets created here.
    const task = await createTask(db, { title: `${MARK} task`, due_date: today, contact_id: contact.id });
    createdIds.push(task.id);
    check("createTask", !task.completed && task.completed_at === null);
    const done = await completeTask(db, task.id, true, { skipGoogleSync: true });
    check("completeTask → completed_at trigger", done.completed && done.completed_at !== null);
    const undone = await completeTask(db, task.id, false, { skipGoogleSync: true });
    check("un-complete clears completed_at", !undone.completed && undone.completed_at === null);

    // --- Reports (all metrics), search, today, overview ----------------------
    console.log("Reports / search / screens:");
    const metrics: ReportMetric[] = ["deals_submitted", "deals_by_stage", "deals_by_outcome", "stage_progression", "activity", "tasks_completed"];
    for (const metric of metrics) {
      try {
        // stage_progression is the one metric with a required parameter.
        const spec = metric === "stage_progression" ? { metric, target_stage: "term_sheet" as const } : { metric };
        const r = await runReport(db, spec);
        check(`report ${metric}`, typeof r.total === "number" && Array.isArray(r.rows));
      } catch (err) {
        check(`report ${metric}`, false, err instanceof Error ? err.message : String(err));
      }
    }
    const hits = await searchAll(db, MARK);
    check("search finds contact/company/deal", ["contact", "company", "deal"].every((k) => hits.some((h) => h.kind === k)));
    const commaHits = await searchAll(db, "Smith, John");
    check("search survives commas", Array.isArray(commaHits));
    const due = await whatsDue(db);
    check("whatsDue runs", due.today === today && typeof due.totalOpenTasks === "number");
    check("whatsDue sees audit task due today", due.openTasks.some((t) => t.id === task.id));
    const stats = await overviewStats(db);
    check("overviewStats runs", stats.dealsThisMonth >= 1 && stats.totalContacts > 0);

    // --- Audit log attribution ----------------------------------------------
    console.log("Audit log:");
    const { data: auditRows, error: auditErr } = await db
      .from("audit_log")
      .select("action, source")
      .eq("record_id", deal.id);
    check("audit rows written for the deal", (auditRows?.length ?? 0) >= 5, auditErr?.message ?? `${auditRows?.length ?? 0} rows`);
    check("audit source attributed as system", auditRows?.every((r) => r.source === "system") ?? false);

    // --- Delete guards + cascades --------------------------------------------
    console.log("Deletes:");
    await expectThrow("deleteContact blocked while deals exist", () => deleteContact(db, contact.id), /deal/i);
    await deleteDeal(db, deal.id);
    check("deleteDeal", (await getDeal(db, deal.id)) === null);
    const { data: orphanGuarantors } = await db.from("guarantors").select("id").eq("deal_id", deal.id);
    check("guarantors cascade with the deal", (orphanGuarantors?.length ?? 0) === 0);
    const { data: orphanSecurities } = await db.from("deal_securities").select("id").eq("deal_id", deal.id);
    check("securities cascade with the deal", (orphanSecurities?.length ?? 0) === 0);
    const { data: keptInteraction } = await db.from("interactions").select("id, deal_id").eq("id", interaction.id).single();
    check("interactions survive deal delete", !!keptInteraction);
    await deleteTask(db, task.id);
    await deleteContact(db, contact.id);
    check("deleteContact after deal removed", (await getContact(db, contact.id)) === null);
    const { data: goneInteractions } = await db.from("interactions").select("id").eq("id", interaction.id);
    check("interactions cascade with the contact", (goneInteractions?.length ?? 0) === 0);
    await deleteCompany(db, companyId);
    check("deleteCompany", (await getCompany(db, companyId)) === null);

    // --- Google (READ-ONLY) ---------------------------------------------------
    console.log("Google (read-only):");
    try {
      const { data: tokens } = await db.from("google_oauth_tokens").select("refresh_token").limit(1);
      const accessToken = await refreshAccessToken(tokens![0].refresh_token);
      check("OAuth token refresh", accessToken.length > 20);
      const sent = await countSentSince(accessToken, sydneyMidnightEpoch(today));
      check("Gmail sent-today count", Number.isInteger(sent) && sent >= 0, `${sent} today`);
      const tasklist = await ensureViaTasklist(accessToken);
      const gtasks = await listGoogleTasks(accessToken, tasklist);
      check("Google Tasks list reachable", Array.isArray(gtasks), `${gtasks.length} tasks in Vía OS list`);
      const now = new Date();
      const events = await listRecentEvents(accessToken, {
        timeMin: new Date(now.getTime() - 7 * 86_400_000).toISOString(),
        timeMax: now.toISOString(),
      });
      check("Google Calendar reachable", Array.isArray(events), `${events.length} events last 7d`);
    } catch (err) {
      check("Google integration", false, err instanceof Error ? err.message : String(err));
    }
  } finally {
    // Remove leftovers and this run's audit-log noise, whatever happened above.
    await scrub(db, createdIds).catch((err) => console.error("scrub failed:", err));
  }

  console.log(`\n${pass} passed, ${fail} failed${fail ? "\n- " + failures.join("\n- ") : ""}`);
  if (fail > 0) process.exit(1);
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
