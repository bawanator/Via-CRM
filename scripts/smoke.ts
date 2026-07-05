// Read-path smoke test: exercises every crm function a page renders with,
// against the real database, so query/join/RLS regressions surface without a
// browser. Run: npm run smoke
import { config } from "dotenv";
import { createAdminClient } from "../src/lib/supabase/admin";
import { listContacts, listBrokers, getContact } from "../src/lib/crm/contacts";
import { listDeals, listLoanBook, getDeal } from "../src/lib/crm/deals";
import { whatsDue } from "../src/lib/crm/today";
import { listOpenTasks } from "../src/lib/crm/tasks";
import { searchAll } from "../src/lib/crm/search";
import { listSavedReports, listPinnedReports } from "../src/lib/crm/savedReports";
import { runReport } from "../src/lib/crm/reports";
import { listContactTypes } from "../src/lib/crm/contactTypes";
import { listAuditLog } from "../src/lib/crm/audit";

config({ path: ".env.local" });
config();

let failures = 0;
async function check(name: string, fn: () => Promise<unknown>) {
  try {
    const r = await fn();
    const n = Array.isArray(r) ? `${r.length} rows` : r == null ? "null" : "ok";
    console.log(`  ✓ ${name} — ${n}`);
  } catch (err) {
    failures++;
    console.error(`  ✗ ${name} — ${err instanceof Error ? err.message : err}`);
  }
}

async function main() {
  const db = createAdminClient("system");
  console.log("Smoke-testing v2 read paths against the live DB:\n");

  const contacts = await listContacts(db, {});
  await check("listContacts", async () => contacts);
  await check("listBrokers", () => listBrokers(db, {}));
  await check("listContacts type=Broker location filter", () => listContacts(db, { type: "Broker" }));
  await check("getContact(first)", () => (contacts[0] ? getContact(db, contacts[0].id) : Promise.resolve(null)));

  const liveDeals = await listDeals(db, { status: "live" });
  await check("listDeals live", async () => liveDeals);
  await check("listDeals lost", () => listDeals(db, { status: "lost" }));
  const loanBook = await listLoanBook(db);
  await check("listLoanBook (settled + guarantors join)", async () => loanBook);
  const settled = await listDeals(db, { status: "settled" });
  await check("getDeal(settled — guarantors/key_dates/links)", () =>
    settled[0] ? getDeal(db, settled[0].id) : Promise.resolve(null),
  );

  await check("whatsDue (tasks + pipeline + cold)", () => whatsDue(db));
  await check("listOpenTasks", () => listOpenTasks(db));
  await check("searchAll('a')", () => searchAll(db, "a"));
  await check("searchAll('Smith, John') — comma safety", () => searchAll(db, "Smith, John"));
  await check("listContactTypes", () => listContactTypes(db));
  await check("listAuditLog", () => listAuditLog(db, {}));

  const reports = await listSavedReports(db);
  await check("listSavedReports", async () => reports);
  const pinned = await listPinnedReports(db);
  await check("listPinnedReports", async () => pinned);
  for (const r of pinned) {
    await check(`runReport "${r.name}" (${(r.spec as { metric?: string }).metric})`, () =>
      runReport(db, r.spec as Parameters<typeof runReport>[1]),
    );
  }
  // Every metric at least once.
  for (const metric of ["deals_submitted", "deals_by_stage", "deals_by_outcome", "activity"] as const) {
    await check(`runReport metric=${metric}`, () => runReport(db, { metric }));
  }
  await check("runReport stage_progression→term_sheet", () =>
    runReport(db, { metric: "stage_progression", target_stage: "term_sheet" }),
  );

  console.log(`\n${failures === 0 ? "ALL GREEN" : `${failures} FAILURE(S)`}`);
  process.exit(failures === 0 ? 0 : 1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
