// Dev seed: realistic Australian private-credit demo data for Vía OS v2.
//
//   npm run seed            — seed an empty database
//   npm run seed -- --force — wipe ALL CRM data and reseed (destructive!)
//
// Refuses to touch a non-empty `contacts` table without --force. With --force it
// wipes every CRM table in FK-safe order (tasks, guarantors, saved_reports,
// drive_links, key_dates, interactions, deals, contacts) — contact_types is a
// migration-seeded lookup and is left alone.
//
// All dates are computed relative to today via src/lib/dates so the data always
// demos well: one broker has an overdue next action, one has gone cold, one
// settled deal matures in ~45 days, one key date is overdue, tasks span
// today/overdue/upcoming, and the live deals sit across the whole pipeline.
//
// Three deliberate mechanics, mirroring production behaviour:
//   * last_contact_date is NEVER set directly — it is trigger-derived from
//     interactions (bump_last_contact), so we seed interactions instead.
//   * maturity_date is NEVER set — the DB derives it (settlement + term months).
//   * live deals are created at Scenario and walked forward with moveDealStage,
//     so the audit log carries genuine stage transitions the stage_progression
//     report reads from.
// Every write parses through the Zod schemas and the shared crm functions, with
// change source "system" (audit_log records source = 'system').
import { config } from "dotenv";
import type { z } from "zod";
import type { DealPipelineStage } from "@/lib/database.types";
import { createAdminClient } from "@/lib/supabase/admin";
import { PIPELINE_STAGES } from "@/lib/domain";
import { addDaysISO, addMonthsClamped, todayISO } from "@/lib/dates";
import {
  contactInputSchema,
  dealInputSchema,
  driveLinkInputSchema,
  guarantorInputSchema,
  interactionInputSchema,
  keyDateInputSchema,
  savedReportInputSchema,
  taskInputSchema,
} from "@/lib/schemas";
import { createContact } from "@/lib/crm/contacts";
import { createDeal, moveDealStage } from "@/lib/crm/deals";
import { addGuarantor } from "@/lib/crm/guarantors";
import { logInteraction } from "@/lib/crm/interactions";
import { addKeyDate, completeKeyDate } from "@/lib/crm/keyDates";
import { addDriveLink } from "@/lib/crm/driveLinks";
import { createTask, completeTask } from "@/lib/crm/tasks";
import { createSavedReport } from "@/lib/crm/savedReports";

config({ path: ".env.local" });
config();

async function main() {
  const force = process.argv.includes("--force");
  const db = createAdminClient("system");

  // --- Safety: never clobber real data by accident -------------------------
  const { count, error: countError } = await db.from("contacts").select("*", { count: "exact", head: true });
  if (countError) throw new Error(`Checking contacts table: ${countError.message}`);
  if ((count ?? 0) > 0) {
    if (!force) {
      console.error(`Contacts table already has ${count} row(s) — refusing to seed a non-empty database.`);
      console.error("Re-run with --force to wipe ALL CRM data and reseed.");
      process.exit(1);
    }
    console.log(`--force: wiping existing CRM data (${count} contact(s) and everything attached)…`);
    // FK-safe order: children before parents (contact_types is left untouched).
    const tables = [
      "tasks",
      "guarantors",
      "saved_reports",
      "drive_links",
      "key_dates",
      "interactions",
      "deals",
      "contacts",
    ] as const;
    for (const table of tables) {
      const { error } = await db.from(table).delete().not("id", "is", null);
      if (error) throw new Error(`Wiping ${table}: ${error.message}`);
    }
  }

  // --- Relative-date helpers ------------------------------------------------
  const today = todayISO();
  const ago = (days: number) => addDaysISO(today, -days);
  const ahead = (days: number) => addDaysISO(today, days);
  // Sydney business hours (10:00–16:00) with a +10:00 offset keep the Sydney
  // calendar date — and therefore the trigger-derived last_contact_date — on the
  // intended day, robustly across daylight-saving transitions.
  const at = (daysAgo: number, hour: number) => `${ago(daysAgo)}T${String(hour).padStart(2, "0")}:00:00+10:00`;

  // --- Schema-validated writers --------------------------------------------
  const seedContact = (input: z.input<typeof contactInputSchema>) =>
    createContact(db, contactInputSchema.parse(input));
  const seedDeal = (input: z.input<typeof dealInputSchema>) => createDeal(db, dealInputSchema.parse(input));
  // Create a live deal at Scenario, then walk it to its current stage so the
  // audit log records real transitions (stage_progression reads from them).
  const seedLiveDeal = async (
    input: Omit<z.input<typeof dealInputSchema>, "pipeline_stage" | "status">,
    targetStage: DealPipelineStage,
  ) => {
    const deal = await seedDeal({ ...input, pipeline_stage: "scenario", status: "live" });
    const target = PIPELINE_STAGES.indexOf(targetStage);
    let row = deal;
    for (let i = 1; i <= target; i += 1) row = await moveDealStage(db, deal.id, PIPELINE_STAGES[i]);
    return row;
  };
  const seedInteraction = (input: z.input<typeof interactionInputSchema>) =>
    logInteraction(db, interactionInputSchema.parse(input));
  const seedGuarantor = (input: z.input<typeof guarantorInputSchema>) =>
    addGuarantor(db, guarantorInputSchema.parse(input));
  const seedKeyDate = async (input: z.input<typeof keyDateInputSchema>, completed = false) => {
    const row = await addKeyDate(db, keyDateInputSchema.parse(input));
    return completed ? completeKeyDate(db, row.id) : row;
  };
  const seedDriveLink = (input: z.input<typeof driveLinkInputSchema>) =>
    addDriveLink(db, driveLinkInputSchema.parse(input));
  const seedTask = async (input: z.input<typeof taskInputSchema>, completed = false) => {
    const row = await createTask(db, taskInputSchema.parse(input));
    return completed ? completeTask(db, row.id) : row;
  };
  const seedSavedReport = (input: z.input<typeof savedReportInputSchema>) =>
    createSavedReport(db, savedReportInputSchema.parse(input));

  // --- Contacts: 5 brokers (all 4 stages) + solicitor, valuer, borrower ------
  // Broker type is the default; location spans Sydney/Melbourne/Brisbane so the
  // location filter demos. next_action(_date) apply only to Broker-type rows.
  const sarah = await seedContact({
    full_name: "Sarah Chen",
    company: "Aria Capital",
    email: "sarah.chen@ariacapital.com.au",
    phone: "0412 338 190",
    linkedin_url: "https://www.linkedin.com/in/sarah-chen-ariacapital",
    location: "Sydney",
    stage: "prime",
    source: "Referral — James Holt",
    notes: "Top-tier introducer with a strong developer book across inner Sydney; expects same-day scenario turnaround.",
    next_action: "Send updated bridging rate card",
    next_action_date: ahead(3),
  });
  const tom = await seedContact({
    full_name: "Tom Papadopoulos",
    company: "Westside Finance",
    email: "tom@westsidefinance.com.au",
    phone: "0433 901 224",
    linkedin_url: "https://www.linkedin.com/in/tom-papadopoulos-westside",
    location: "Melbourne",
    stage: "active_submitter",
    source: "CAFBA conference 2025",
    notes: "Solid commercial book out of the inner west. Prefers WhatsApp for quick scenarios.",
    next_action: "Chase valuer access for 8 Miller St",
    next_action_date: ahead(1),
  });
  // Overdue next action — surfaces red in the Today view.
  const priya = await seedContact({
    full_name: "Priya Sharma",
    company: "Meridian Commercial",
    email: "priya.sharma@meridiancommercial.com.au",
    phone: "0401 552 718",
    location: "Brisbane",
    stage: "active_submitter",
    source: "Referral — Tom Papadopoulos",
    notes: "Development-site specialist across south-east Queensland.",
    next_action: "Request feasibility + DA docs for Kurrajong",
    next_action_date: ago(4),
  });
  // Gone cold — sole interaction is 45 days back (see interactions below).
  const meiling = await seedContact({
    full_name: "Mei-Ling Wong",
    company: "Harbourline Finance",
    email: "meiling.wong@harbourlinefinance.com.au",
    phone: "0438 220 456",
    location: "Sydney",
    stage: "engaged",
    source: "CAFBA lunch, March",
    notes: "Warm first meeting; strong lower north shore network. Needs a reactivation touch.",
    next_action: "Send credit appetite one-pager",
  });
  await seedContact({
    full_name: "Dave Kowalski",
    company: "Fortitude Broking",
    email: "dave.kowalski@fortitudebroking.com.au",
    location: "Melbourne",
    stage: "introduced",
    source: "Introduced by Sarah Chen",
    notes: "Not yet met. Commercial broker who writes a lot of SMSF lends.",
    next_action: "Intro call",
    next_action_date: ahead(7),
  });
  // Non-broker contacts — typed, located, no broker stage / next action.
  await seedContact({
    full_name: "Rebecca Nguyen",
    company: "Nguyen & Associates",
    email: "rebecca@nguyenlegal.com.au",
    phone: "0407 118 664",
    type: "Solicitor",
    location: "Sydney",
    notes: "Panel solicitor — handles our security documentation and settlements.",
  });
  await seedContact({
    full_name: "Michael O'Brien",
    company: "Apex Valuations",
    email: "michael.obrien@apexvaluations.com.au",
    phone: "0419 703 285",
    type: "Valuer",
    location: "Melbourne",
    notes: "Preferred panel valuer for commercial and residual-stock security.",
  });
  const angela = await seedContact({
    full_name: "Angela Rossi",
    company: "Rossi Property Group",
    email: "angela@rossigroup.com.au",
    phone: "0402 664 019",
    type: "Borrower",
    location: "Brisbane",
    notes: "Repeat borrower — director of Rossi Property Group; currently purchasing in North Sydney.",
  });
  console.log("Contacts: 8 (5 brokers — 1 prime, 2 active_submitter, 1 engaged/cold, 1 introduced — + solicitor, valuer, borrower)");

  // --- Deals: 4 live (Scenario→Docs), 2 settled, 2 lost ----------------------
  // The maturing settled deal matures ~45 days out: pick the maturity target and
  // walk settlement back 12 months (date arithmetic only — the DB derives
  // maturity_date from settlement + term).
  const gasworksSettlement = addMonthsClamped(ahead(45), -12);
  const roseberySettlement = addMonthsClamped(today, -3);

  const harbourSt = await seedLiveDeal(
    {
      name: "12 Harbour St, Surry Hills — Bridging",
      broker_id: sarah.id,
      borrower_entity: "Harbour Lane Developments Pty Ltd",
      borrower_contact_name: "Nick Averkiou",
      security_address: "12 Harbour Street, Surry Hills NSW 2010",
      loan_amount: 1_850_000,
      product: "bridging",
      funder: "funder_1",
      notes: "Settle-and-sell bridge across two strata titles; exit via sale of both units.",
    },
    "scenario",
  );
  const millerSt = await seedLiveDeal(
    {
      name: "8 Miller St, North Sydney — Purchase",
      broker_id: tom.id,
      borrower_entity: "Rossi Property Group Pty Ltd",
      borrower_contact_name: "Angela Rossi",
      borrower_contact_email: "angela@rossigroup.com.au",
      borrower_contact_phone: "0402 664 019",
      security_address: "8 Miller Street, North Sydney NSW 2060",
      loan_amount: 2_400_000,
      product: "purchase",
      funder: "funder_2",
      notes: "Purchase of a strata commercial suite; valuation ordered, term sheet issued.",
    },
    "term_sheet",
  );
  const chesterfield = await seedLiveDeal(
    {
      name: "44 Chesterfield Rd, Epping — Residual Stock",
      broker_id: sarah.id,
      borrower_entity: "Chesterfield Projects Pty Ltd",
      security_address: "44 Chesterfield Road, Epping NSW 2121",
      loan_amount: 3_200_000,
      product: "residual_stock",
      funder: "funder_1",
      notes: "Residual stock facility over 6 unsold units; staged releases against exchanged sales.",
    },
    "credit",
  );
  const kurrajong = await seedLiveDeal(
    {
      name: "Lot 3 Bells Line Rd, Kurrajong — Equity Release",
      broker_id: priya.id,
      borrower_entity: "Bells Line Holdings Pty Ltd",
      security_address: "Lot 3 Bells Line of Road, Kurrajong NSW 2758",
      loan_amount: 950_000,
      product: "equity_release",
      funder: "funder_3",
      notes: "Equity release against a DA-approved englobo parcel to fund the next acquisition.",
    },
    "docs",
  );
  const gasworks = await seedDeal({
    name: "The Gasworks, Alexandria — Bridging",
    broker_id: sarah.id,
    borrower_entity: "Gasworks Alexandria Pty Ltd",
    security_address: "2-8 Wyndham Street, Alexandria NSW 2015",
    loan_amount: 2_750_000,
    product: "bridging",
    funder: "funder_1",
    pipeline_stage: "settlement",
    status: "settled",
    settlement_date: gasworksSettlement,
    loan_term_months: 12, // maturity derived by DB: ~45 days from today
    notes: "Exit via sale of the remaining commercial suite; sale campaign under way.",
  });
  const rosebery = await seedDeal({
    name: "Rosebery Mews — Residual Stock",
    broker_id: tom.id,
    borrower_entity: "Rosebery Mews Developments Pty Ltd",
    security_address: "14-18 Rothschild Avenue, Rosebery NSW 2018",
    loan_amount: 4_100_000,
    product: "residual_stock",
    funder: "funder_2",
    pipeline_stage: "settlement",
    status: "settled",
    settlement_date: roseberySettlement,
    loan_term_months: 18,
    notes: "Nine unsold units at settlement; two since exchanged.",
  });
  await seedDeal({
    name: "17 Beach Rd, Bondi — Purchase",
    broker_id: tom.id,
    security_address: "17 Beach Road, Bondi NSW 2026",
    loan_amount: 800_000,
    product: "purchase",
    pipeline_stage: "term_sheet",
    status: "lost",
    loss_reason: "lost_to_competitor",
    notes: "Borrower took a sharper offer from a major bank before docs.",
  });
  await seedDeal({
    name: "31 Kembla St, Wollongong — Bridging",
    broker_id: priya.id,
    security_address: "31 Kembla Street, Wollongong NSW 2500",
    loan_amount: 1_200_000,
    product: "bridging",
    pipeline_stage: "credit",
    status: "lost",
    loss_reason: "ghosted",
    notes: "Sponsor went quiet after the valuation discussion and never returned docs.",
  });
  console.log("Deals: 8 (4 live across Scenario→Docs, 2 settled, 2 lost)");

  // --- Guarantors (2 on a settled deal) --------------------------------------
  await seedGuarantor({
    deal_id: rosebery.id,
    full_name: "Daniel Fitzgerald",
    date_of_birth: "1971-06-12",
    email: "daniel.fitzgerald@rosebery.dev",
    phone: "0414 552 800",
    address: "22 Ocean View Road, Vaucluse NSW 2030",
    notes: "Director and majority shareholder of the borrower entity.",
  });
  await seedGuarantor({
    deal_id: rosebery.id,
    full_name: "Sophie Fitzgerald",
    date_of_birth: "1974-11-03",
    email: "sophie.fitzgerald@rosebery.dev",
    phone: "0414 552 801",
    address: "22 Ocean View Road, Vaucluse NSW 2030",
    notes: "Co-director; supporting guarantor.",
  });
  console.log("Guarantors: 2 (Rosebery Mews)");

  // --- Interactions (drive last_contact_date via DB trigger) ------------------
  const interactions = [
    // Sarah — fresh, three touches in the last fortnight.
    { broker_id: sarah.id, deal_id: chesterfield.id, type: "meeting", occurred_at: at(2, 10), summary: "Coffee at Cross Eatery — walked the Chesterfield residual stock runway and the Gasworks exit timing." },
    { broker_id: sarah.id, deal_id: harbourSt.id, type: "call", occurred_at: at(6, 14), summary: "Ran the Surry Hills bridging scenario; sponsor wants 70% LVR, pricing indication requested." },
    { broker_id: sarah.id, type: "email", occurred_at: at(13, 11), summary: "Sent Q3 settlement volumes and flagged two upcoming residual stock scenarios." },
    // Tom
    { broker_id: tom.id, deal_id: millerSt.id, type: "call", occurred_at: at(4, 15), summary: "Valuer access confirmed for 8 Miller St; report expected Friday." },
    { broker_id: tom.id, type: "email", occurred_at: at(10, 12), summary: "Answered term sheet questions — borrower comfortable with the default rate clause." },
    // Priya — contactable (7 days) even though her next action is overdue.
    { broker_id: priya.id, deal_id: kurrajong.id, type: "meeting", occurred_at: at(7, 11), summary: "Met on the Kurrajong equity release; sponsor holds a DA-approved parcel next door." },
    // Mei-Ling — single touch 45 days back → cold (> 30 days).
    { broker_id: meiling.id, type: "meeting", occurred_at: at(45, 12), summary: "Met at CAFBA lunch — strong lower north shore network, asked for our credit appetite one-pager." },
    // Angela (borrower contact) — a non-broker contact with a logged touch.
    { broker_id: angela.id, deal_id: millerSt.id, type: "call", occurred_at: at(3, 13), summary: "Confirmed the North Sydney purchase timeline; guarantor documents still outstanding." },
  ] as const;
  for (const interaction of interactions) await seedInteraction(interaction);
  console.log(`Interactions: ${interactions.length} (last_contact_date derived by trigger; Mei-Ling Wong left cold at 45 days)`);

  // --- Key dates (loan-book reminders) ---------------------------------------
  await seedKeyDate({
    deal_id: gasworks.id,
    label: "Insurance renewal",
    due_date: ahead(20),
    remind_days_before: 14,
  });
  await seedKeyDate(
    {
      deal_id: gasworks.id,
      label: "First interest review",
      due_date: addMonthsClamped(gasworksSettlement, 1), // long past
      remind_days_before: 7,
    },
    true, // completed
  );
  await seedKeyDate({
    deal_id: rosebery.id,
    label: "Council rates due",
    due_date: ago(12), // incomplete + past → overdue
    remind_days_before: 7,
  });
  console.log("Key dates: 3 (1 upcoming, 1 overdue, 1 completed)");

  // --- Tasks (feed the Today view) -------------------------------------------
  await seedTask({
    title: "Call Priya re: Kurrajong equity release scenario",
    contact_id: priya.id,
    due_date: today, // due today
    notes: "Needs feasibility + DA docs before we can issue a term sheet.",
  });
  await seedTask({
    title: "Send Sarah the updated bridging rate card",
    contact_id: sarah.id,
    due_date: ahead(2), // upcoming
  });
  await seedTask({
    title: "Chase valuation — 8 Miller St",
    deal_id: millerSt.id,
    due_date: ago(2), // overdue
    notes: "Valuer confirmed access; follow up on the report.",
  });
  await seedTask({
    title: "Prep credit committee pack — Chesterfield",
    deal_id: chesterfield.id,
    due_date: today, // due today
  });
  await seedTask({
    title: "Draft Q3 broker portfolio review",
    due_date: ahead(5), // standalone, upcoming
  });
  await seedTask(
    {
      title: "Order valuation — Rosebery Mews",
      deal_id: rosebery.id,
      due_date: ago(10),
    },
    true, // completed
  );
  console.log("Tasks: 6 (2 due today, 1 overdue, 2 upcoming, 1 completed)");

  // --- Saved reports (max 3 pinned) ------------------------------------------
  await seedSavedReport({ name: "Deals submitted (90d)", spec: { metric: "deals_submitted" }, pinned: true, sort: 10 });
  await seedSavedReport({ name: "Live pipeline", spec: { metric: "deals_by_stage" }, pinned: true, sort: 20 });
  await seedSavedReport({
    name: "Scenarios → Term Sheet (90d)",
    spec: { metric: "stage_progression", target_stage: "term_sheet" },
    pinned: true,
    sort: 30,
  });
  console.log("Saved reports: 3 (all pinned)");

  // --- Drive links (links only — the CRM never touches files) -----------------
  await seedDriveLink({
    parent_type: "deal",
    parent_id: chesterfield.id,
    label: "Valuation — 44 Chesterfield Rd",
    url: "https://drive.google.com/file/d/1kX9vQ3mHlaZbC7dEfGhIjKlMnOpQrStU/view",
  });
  await seedDriveLink({
    parent_type: "deal",
    parent_id: millerSt.id,
    label: "Term Sheet — 8 Miller St",
    url: "https://drive.google.com/file/d/1Zx8WvUtSrQpOnMlKjIhGfEdCbA987654/view",
  });
  await seedDriveLink({
    parent_type: "contact",
    parent_id: sarah.id,
    label: "Aria Capital — Accreditation Pack",
    url: "https://drive.google.com/drive/folders/1AbCdEfGhIjKlMnOpQrStUvWxYz0123456",
  });
  console.log("Drive links: 3 (2 deal, 1 contact)");

  console.log(`\nSeed complete — dates are relative to ${today} (Australia/Sydney).`);
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : String(err));
  process.exit(1);
});
