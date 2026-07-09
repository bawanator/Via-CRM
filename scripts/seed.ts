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
  companyInputSchema,
  contactInputSchema,
  dealInputSchema,
  driveLinkInputSchema,
  guarantorInputSchema,
  interactionInputSchema,
  keyDateInputSchema,
  savedReportInputSchema,
  taskInputSchema,
} from "@/lib/schemas";
import { createCompany } from "@/lib/crm/companies";
import { createContact } from "@/lib/crm/contacts";
import { createDeal, moveDealStage } from "@/lib/crm/deals";
import { addSecurity } from "@/lib/crm/securities";
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
    // FK-safe order: children before parents (contact_types is left untouched;
    // companies last — contacts reference them).
    const tables = [
      "tasks",
      "guarantors",
      "saved_reports",
      "drive_links",
      "key_dates",
      "interactions",
      "deals",
      "contacts",
      "companies",
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
  const seedCompany = (input: z.input<typeof companyInputSchema>) =>
    createCompany(db, companyInputSchema.parse(input));
  // Contacts link to companies by id (the free-text column is gone) — the
  // company_name schema field is a UI/MCP convenience the seed doesn't use.
  const seedContact = (input: z.input<typeof contactInputSchema>, companyId: string | null = null) => {
    const { company_name: _companyName, ...fields } = contactInputSchema.parse(input);
    return createContact(db, { ...fields, company_id: companyId });
  };
  // Securities moved to their own table (00005): pull the seed address out,
  // create the deal, then attach the address as the first security row.
  const seedDeal = async (input: z.input<typeof dealInputSchema> & { security_address?: string }) => {
    const { security_address, ...dealInput } = input;
    const deal = await createDeal(db, dealInputSchema.parse(dealInput));
    if (security_address) await addSecurity(db, { deal_id: deal.id, address: security_address });
    return deal;
  };
  // Create a live deal at Scenario, then walk it to its current stage so the
  // audit log records real transitions (stage_progression reads from them).
  const seedLiveDeal = async (
    input: Omit<z.input<typeof dealInputSchema>, "pipeline_stage" | "status"> & { security_address?: string },
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

  // --- Companies (first-class records; contacts link by company_id) ----------
  // In production these are auto-created (typed names via ensureCompanyByName,
  // email domains via the Gmail sync); the seed creates them explicitly so
  // domains and locations are set for the demo.
  const aria = await seedCompany({
    name: "Aria Capital",
    domain: "ariacapital.com.au",
    location: "Melbourne",
    notes: "Boutique brokerage with a strong developer book — two of our best introducers sit here.",
  });
  const westside = await seedCompany({
    name: "Westside Finance",
    domain: "westsidefinance.com.au",
    location: "Melbourne",
  });
  const meridian = await seedCompany({
    name: "Meridian Commercial",
    domain: "meridiancommercial.com.au",
    location: "Brisbane",
  });
  const flourish = await seedCompany({
    name: "Flourish Finance",
    domain: "flourishfinance.com.au",
    location: "Melbourne",
  });
  // Companies for the non-broker contacts (name-only, like ensureCompanyByName
  // would create from a typed name).
  const nguyenLegal = await seedCompany({ name: "Nguyen & Associates", location: "Sydney" });
  const apex = await seedCompany({ name: "Apex Valuations", location: "Melbourne" });
  const rossi = await seedCompany({ name: "Rossi Property Group", location: "Brisbane" });
  console.log("Companies: 7 (4 brokerages with domains + 3 from non-broker contacts)");

  // --- Contacts: 5 brokers (all 4 stages) + solicitor, valuer, borrower ------
  // Broker type is the default; location spans Sydney/Melbourne/Brisbane so the
  // location filter demos. next_action(_date) apply only to Broker-type rows.
  // Sarah AND Mei-Ling both sit at Aria Capital, so the company People tab
  // demos with multiple people.
  const sarah = await seedContact(
    {
      full_name: "Sarah Chen",
      email: "sarah.chen@ariacapital.com.au",
      phone: "0412 338 190",
      linkedin_url: "https://www.linkedin.com/in/sarah-chen-ariacapital",
      location: "Sydney",
      stage: "prime",
      source: "Referral — James Holt",
      notes: "Top-tier introducer with a strong developer book across inner Sydney; expects same-day scenario turnaround.",
      next_action: "Send updated bridging rate card",
      next_action_date: ahead(3),
    },
    aria.id,
  );
  const tom = await seedContact(
    {
      full_name: "Tom Papadopoulos",
      email: "tom@westsidefinance.com.au",
      phone: "0433 901 224",
      linkedin_url: "https://www.linkedin.com/in/tom-papadopoulos-westside",
      location: "Melbourne",
      stage: "active_submitter",
      source: "CAFBA conference 2025",
      notes: "Solid commercial book out of the inner west. Prefers WhatsApp for quick scenarios.",
      next_action: "Chase valuer access for 8 Miller St",
      next_action_date: ahead(1),
    },
    westside.id,
  );
  // Overdue next action — surfaces red in the Today view.
  const priya = await seedContact(
    {
      full_name: "Priya Sharma",
      email: "priya.sharma@meridiancommercial.com.au",
      phone: "0401 552 718",
      location: "Brisbane",
      stage: "active_submitter",
      source: "Referral — Tom Papadopoulos",
      notes: "Development-site specialist across south-east Queensland.",
      next_action: "Request feasibility + DA docs for Kurrajong",
      next_action_date: ago(4),
    },
    meridian.id,
  );
  // Gone cold — sole interaction is 45 days back (see interactions below).
  // Second broker at Aria Capital (with Sarah).
  const meiling = await seedContact(
    {
      full_name: "Mei-Ling Wong",
      email: "meiling.wong@ariacapital.com.au",
      phone: "0438 220 456",
      location: "Sydney",
      stage: "engaged",
      source: "CAFBA lunch, March",
      notes: "Sarah's colleague at Aria — warm first meeting; strong lower north shore network. Needs a reactivation touch.",
      next_action: "Send credit appetite one-pager",
    },
    aria.id,
  );
  await seedContact(
    {
      full_name: "Dave Kowalski",
      email: "dave.kowalski@flourishfinance.com.au",
      location: "Melbourne",
      stage: "introduced",
      source: "Introduced by Sarah Chen",
      notes: "Not yet met. Commercial broker who writes a lot of SMSF lends.",
      next_action: "Intro call",
      next_action_date: ahead(7),
    },
    flourish.id,
  );
  // Non-broker contacts — typed, located, no broker stage / next action.
  await seedContact(
    {
      full_name: "Rebecca Nguyen",
      email: "rebecca@nguyenlegal.com.au",
      phone: "0407 118 664",
      type: "Solicitor",
      location: "Sydney",
      notes: "Panel solicitor — handles our security documentation and settlements.",
    },
    nguyenLegal.id,
  );
  await seedContact(
    {
      full_name: "Michael O'Brien",
      email: "michael.obrien@apexvaluations.com.au",
      phone: "0419 703 285",
      type: "Valuer",
      location: "Melbourne",
      notes: "Preferred panel valuer for commercial and residual-stock security.",
    },
    apex.id,
  );
  const angela = await seedContact(
    {
      full_name: "Angela Rossi",
      email: "angela@rossigroup.com.au",
      phone: "0402 664 019",
      type: "Borrower",
      location: "Brisbane",
      notes: "Repeat borrower — director of Rossi Property Group; currently purchasing in North Sydney.",
    },
    rossi.id,
  );
  console.log(
    "Contacts: 8 (5 brokers — 1 prime, 2 active_submitter, 1 engaged/cold, 1 introduced — + solicitor, valuer, borrower; Sarah + Mei-Ling both at Aria Capital)",
  );

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
    // Sarah — a note too, so the Notes tab has content.
    { broker_id: sarah.id, type: "note", occurred_at: at(5, 16), summary: "Sarah mentioned Aria is hiring two more brokers in Q1 — expect referral flow to lift. Keep the rate card current and turn her scenarios around same-day." },
    // Tom
    { broker_id: tom.id, deal_id: millerSt.id, type: "call", occurred_at: at(4, 15), summary: "Valuer access confirmed for 8 Miller St; report expected Friday." },
    { broker_id: tom.id, type: "email", occurred_at: at(10, 12), summary: "Answered term sheet questions — borrower comfortable with the default rate clause." },
    { broker_id: tom.id, type: "note", occurred_at: at(9, 17), summary: "Tom's book skews SMSF and owner-occupier commercial. He'll bring us the deals the banks decline on postcode risk — good fit for bridging under 70% LVR." },
    // Priya — contactable (7 days) even though her next action is overdue.
    { broker_id: priya.id, deal_id: kurrajong.id, type: "meeting", occurred_at: at(7, 11), summary: "Met on the Kurrajong equity release; sponsor holds a DA-approved parcel next door." },
    { broker_id: priya.id, deal_id: kurrajong.id, type: "call", occurred_at: at(1, 9), summary: "Called Priya re: Kurrajong docs — solicitor has the mortgage pack, guarantor signing booked for Thursday. She flagged a new residual stock scenario in Newstead, ~$2.1m." },
    // Mei-Ling — single touch 45 days back → cold (> 30 days).
    { broker_id: meiling.id, type: "meeting", occurred_at: at(45, 12), summary: "Met at CAFBA lunch — strong lower north shore network, asked for our credit appetite one-pager." },
    // Angela (borrower contact) — a non-broker contact with a logged touch.
    { broker_id: angela.id, deal_id: millerSt.id, type: "call", occurred_at: at(3, 13), summary: "Confirmed the North Sydney purchase timeline; guarantor documents still outstanding." },
  ] as const;
  for (const interaction of interactions) await seedInteraction(interaction);
  console.log(
    `Interactions: ${interactions.length} (4 calls + 2 notes for the Calls/Notes tabs; last_contact_date derived by trigger; Mei-Ling Wong left cold at 45 days)`,
  );

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
