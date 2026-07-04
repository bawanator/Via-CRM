// Dev seed: realistic Australian private-credit demo data.
//
//   npm run seed            — seed an empty database
//   npm run seed -- --force — wipe ALL CRM data and reseed (destructive!)
//
// Refuses to touch a non-empty brokers table without --force. All dates are
// computed relative to today so the seeded data always demos well: one broker
// has an overdue next action, one has gone cold, one settled deal matures in
// ~45 days, and one key date is overdue.
//
// Two deliberate mechanics, mirroring production behaviour:
//   * last_contact_date is NEVER set directly — it is trigger-derived from
//     interactions (bump_last_contact), so we seed interactions instead.
//   * maturity_date is NEVER set — the DB derives settlement + term months.
// Every write parses through the Zod schemas and the shared crm functions,
// with change source "system" (audit_log records source = 'system').
import { config } from "dotenv";
import type { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";
import { addDaysISO, addMonthsClamped, todayISO } from "@/lib/dates";
import {
  brokerInputSchema,
  dealInputSchema,
  driveLinkInputSchema,
  interactionInputSchema,
  keyDateInputSchema,
} from "@/lib/schemas";
import { createBroker } from "@/lib/crm/brokers";
import { createDeal } from "@/lib/crm/deals";
import { logInteraction } from "@/lib/crm/interactions";
import { addKeyDate, completeKeyDate } from "@/lib/crm/keyDates";
import { addDriveLink } from "@/lib/crm/driveLinks";

config({ path: ".env.local" });
config();

async function main() {
  const force = process.argv.includes("--force");
  const db = createAdminClient("system");

  // --- Safety: never clobber real data by accident -------------------------
  const { count, error: countError } = await db.from("brokers").select("*", { count: "exact", head: true });
  if (countError) throw new Error(`Checking brokers table: ${countError.message}`);
  if ((count ?? 0) > 0) {
    if (!force) {
      console.error(`Brokers table already has ${count} row(s) — refusing to seed a non-empty database.`);
      console.error("Re-run with --force to wipe ALL CRM data (brokers, deals, interactions, key dates, drive links) and reseed.");
      process.exit(1);
    }
    console.log(`--force: wiping existing CRM data (${count} broker(s) and everything attached)…`);
    // Order matters: deals reference brokers without cascade.
    for (const table of ["drive_links", "key_dates", "interactions", "deals", "brokers"] as const) {
      const { error } = await db.from(table).delete().not("id", "is", null);
      if (error) throw new Error(`Wiping ${table}: ${error.message}`);
    }
  }

  // --- Relative-date helpers ------------------------------------------------
  const today = todayISO();
  const ago = (days: number) => addDaysISO(today, -days);
  const ahead = (days: number) => addDaysISO(today, days);
  // Sydney business hours (10:00–16:00 AEST) keep the UTC calendar date — and
  // therefore the trigger-derived last_contact_date — on the same day.
  const at = (daysAgo: number, hour: number) => `${ago(daysAgo)}T${String(hour).padStart(2, "0")}:00:00+10:00`;

  // --- Schema-validated writers ---------------------------------------------
  const seedBroker = (input: z.input<typeof brokerInputSchema>) =>
    createBroker(db, brokerInputSchema.parse(input));
  const seedDeal = (input: z.input<typeof dealInputSchema>) => createDeal(db, dealInputSchema.parse(input));
  const seedInteraction = (input: z.input<typeof interactionInputSchema>) =>
    logInteraction(db, interactionInputSchema.parse(input));
  const seedKeyDate = async (input: z.input<typeof keyDateInputSchema>, completed = false) => {
    const row = await addKeyDate(db, keyDateInputSchema.parse(input));
    return completed ? completeKeyDate(db, row.id) : row;
  };
  const seedDriveLink = (input: z.input<typeof driveLinkInputSchema>) =>
    addDriveLink(db, driveLinkInputSchema.parse(input));

  // --- Brokers (all four stages) ---------------------------------------------
  const sarah = await seedBroker({
    full_name: "Sarah Chen",
    company: "Aria Capital",
    email: "sarah.chen@ariacapital.com.au",
    phone: "0412 338 190",
    linkedin_url: "https://www.linkedin.com/in/sarah-chen-ariacapital",
    stage: "prime",
    source: "Referral — James Holt (HCP)",
    notes: "Top-tier introducer. Strong developer book across inner Sydney; expects same-day scenario turnaround.",
    next_action: "Send updated bridge rate card",
    next_action_date: ahead(3),
  });
  const tom = await seedBroker({
    full_name: "Tom Papadopoulos",
    company: "Westside Finance",
    email: "tom@westsidefinance.com.au",
    phone: "0433 901 224",
    linkedin_url: "https://www.linkedin.com/in/tom-papadopoulos-westside",
    stage: "active_submitter",
    source: "CAFBA conference 2025",
    notes: "Solid commercial book out of Parramatta. Prefers WhatsApp for quick scenarios.",
    next_action: "Chase valuer access for 8 Miller St",
    next_action_date: ahead(1),
  });
  const priya = await seedBroker({
    full_name: "Priya Sharma",
    company: "Meridian Commercial",
    email: "priya.sharma@meridiancommercial.com.au",
    phone: "0401 552 718",
    stage: "active_submitter",
    source: "Referral — Tom Papadopoulos",
    notes: "Development-site specialist, Illawarra and south-west Sydney.",
    next_action: "Request feasibility + DA docs for Kurrajong land",
    next_action_date: ahead(2),
  });
  // Overdue next action — shows red in Today view.
  const jack = await seedBroker({
    full_name: "Jack O'Sullivan",
    company: "Coastline Lending Group",
    email: "jack@coastlinelending.com.au",
    phone: "0422 764 903",
    stage: "engaged",
    source: "LinkedIn outreach",
    notes: "Mostly resi book but sees a handful of bridging scenarios a year. Keen on private credit exposure.",
    next_action: "Book follow-up coffee — promised to bring two bridge scenarios",
    next_action_date: ago(5),
  });
  // Gone cold — sole interaction is 45 days back (see interactions below).
  const meiling = await seedBroker({
    full_name: "Mei-Ling Wong",
    company: "Harbourline Finance",
    email: "meiling.wong@harbourlinefinance.com.au",
    phone: "0438 220 456",
    stage: "engaged",
    source: "CAFBA lunch, March",
    notes: "Warm first meeting; strong lower north shore network. Needs a reactivation touch.",
    next_action: "Send credit appetite one-pager",
  });
  const dave = await seedBroker({
    full_name: "Dave Kowalski",
    company: "Fortitude Broking",
    email: "dave.kowalski@fortitudebroking.com.au",
    stage: "introduced",
    source: "Introduced by Sarah Chen",
    notes: "Not yet met. Commercial broker out of Blacktown; writes a lot of SMSF lends.",
    next_action: "Intro call",
    next_action_date: ahead(7),
  });
  const brokers = [sarah, tom, priya, jack, meiling, dave];
  console.log(`Brokers: ${brokers.length} (1 prime, 2 active_submitter, 2 engaged, 1 introduced)`);

  // --- Deals -----------------------------------------------------------------
  // Settled deal 1 matures ~45 days out: pick the maturity target and walk the
  // settlement date back 12 months (date arithmetic only — the DB trigger
  // derives maturity_date from settlement + term).
  const gasworksSettlement = addMonthsClamped(ahead(45), -12);
  const roseberySettlement = addMonthsClamped(today, -3);

  const harbourSt = await seedDeal({
    name: "12 Harbour St, Surry Hills — Bridge",
    broker_id: sarah.id,
    borrower_entity: "Harbour Lane Developments Pty Ltd",
    borrower_contact_name: "Nick Averkiou",
    security_address: "12 Harbour Street, Surry Hills NSW 2010",
    loan_amount: 1_850_000,
    product: "bridge",
    funder: "hcp",
    pipeline_stage: "scenario",
    status: "live",
    notes: "Settle-and-sell bridge across two strata titles; exit via sale of both units.",
  });
  const chesterfield = await seedDeal({
    name: "44 Chesterfield Rd, Epping — Residual Stock",
    broker_id: sarah.id,
    borrower_entity: "Chesterfield Projects Pty Ltd",
    security_address: "44 Chesterfield Road, Epping NSW 2121",
    loan_amount: 3_200_000,
    product: "draw",
    funder: "first_federal",
    pipeline_stage: "credit",
    status: "live",
    notes: "Residual stock facility over 6 unsold units; staged drawdowns against exchanged sales.",
  });
  const millerSt = await seedDeal({
    name: "8 Miller St, North Sydney — Refinance Bridge",
    broker_id: tom.id,
    borrower_entity: "Rossi Property Group Pty Ltd",
    borrower_contact_name: "Angela Rossi",
    borrower_contact_email: "angela@rossigroup.com.au",
    security_address: "8 Miller Street, North Sydney NSW 2060",
    loan_amount: 2_400_000,
    product: "bridge",
    funder: "hcp",
    pipeline_stage: "term_sheet",
    status: "live",
    notes: "Refinance out of expiring facility; valuation ordered.",
  });
  const kurrajong = await seedDeal({
    name: "Lot 3 Bells Line Rd, Kurrajong — Land Bank",
    broker_id: priya.id,
    borrower_entity: "Bells Line Holdings Pty Ltd",
    security_address: "Lot 3 Bells Line of Road, Kurrajong NSW 2758",
    loan_amount: 950_000,
    product: "hold",
    pipeline_stage: "enquiry",
    status: "live",
    notes: "Early enquiry — awaiting feasibility and DA status before scenario.",
  });
  const gasworks = await seedDeal({
    name: "The Gasworks, Alexandria — Bridge",
    broker_id: sarah.id,
    borrower_entity: "Gasworks Alexandria Pty Ltd",
    security_address: "2-8 Wyndham Street, Alexandria NSW 2015",
    loan_amount: 2_750_000,
    product: "bridge",
    funder: "hcp",
    pipeline_stage: "settlement",
    status: "settled",
    settlement_date: gasworksSettlement,
    loan_term_months: 12, // maturity derived by DB: ~45 days from today
    notes: "Exit via sale of remaining commercial suite; campaign under way.",
  });
  const rosebery = await seedDeal({
    name: "Rosebery Mews — Residual Stock",
    broker_id: tom.id,
    borrower_entity: "Rosebery Mews Developments Pty Ltd",
    security_address: "14-18 Rothschild Avenue, Rosebery NSW 2018",
    loan_amount: 4_100_000,
    product: "hold",
    funder: "first_federal",
    pipeline_stage: "settlement",
    status: "settled",
    settlement_date: roseberySettlement,
    loan_term_months: 18,
    notes: "Nine unsold units at settlement; two since exchanged.",
  });
  await seedDeal({
    name: "17 Beach Rd, Bondi — Second Mortgage",
    broker_id: tom.id,
    security_address: "17 Beach Road, Bondi NSW 2026",
    loan_amount: 800_000,
    product: "other",
    pipeline_stage: "term_sheet",
    status: "withdrawn",
    notes: "Borrower refinanced with a major bank before docs.",
  });
  await seedDeal({
    name: "Kembla St, Wollongong — DA Site Bridge",
    broker_id: priya.id,
    security_address: "31 Kembla Street, Wollongong NSW 2500",
    loan_amount: 1_200_000,
    product: "bridge",
    funder: "hcp",
    pipeline_stage: "credit",
    status: "fell_over",
    notes: "Valuation came in 18% under contract; sponsor walked.",
  });
  console.log("Deals: 8 (4 live, 2 settled, 1 withdrawn, 1 fell over)");

  // --- Interactions (drive last_contact_date via DB trigger) ------------------
  const interactions = [
    // Sarah — fresh contact, three touches in the last fortnight.
    { broker_id: sarah.id, deal_id: chesterfield.id, type: "meeting", occurred_at: at(2, 10), summary: "Coffee at Cross Eatery — walked the Chesterfield residual stock runway and Gasworks exit timing." },
    { broker_id: sarah.id, deal_id: harbourSt.id, type: "call", occurred_at: at(6, 14), summary: "Ran the Surry Hills bridge scenario; sponsor wants 70% LVR, pricing indication requested." },
    { broker_id: sarah.id, type: "email", occurred_at: at(13, 11), summary: "Sent Q3 settlement volumes and flagged two upcoming residual stock scenarios." },
    // Tom
    { broker_id: tom.id, deal_id: millerSt.id, type: "call", occurred_at: at(4, 15), summary: "Valuer access confirmed for 8 Miller St; report expected Friday." },
    { broker_id: tom.id, type: "email", occurred_at: at(11, 12), summary: "Answered term sheet questions — borrower comfortable with the default rate clause." },
    // Priya
    { broker_id: priya.id, deal_id: kurrajong.id, type: "meeting", occurred_at: at(8, 11), summary: "Intro meeting on the Kurrajong land bank; sponsor holds a DA-approved englobo parcel next door." },
    { broker_id: priya.id, type: "email", occurred_at: at(18, 10), summary: "Post-mortem on Kembla St — keen to bring the next DA site to us early." },
    // Jack — coffee done three weeks ago; his next action is now overdue.
    { broker_id: jack.id, type: "meeting", occurred_at: at(21, 10), summary: "First coffee at Speedos, Bondi. Mostly resi book; expects two bridge scenarios this quarter." },
    // Mei-Ling — single touch 45 days back → cold (> 30 days).
    { broker_id: meiling.id, type: "meeting", occurred_at: at(45, 12), summary: "Met at CAFBA lunch — strong lower north shore network, asked for our credit appetite one-pager." },
  ] as const;
  for (const interaction of interactions) await seedInteraction(interaction);
  console.log(`Interactions: ${interactions.length} (last_contact_date derived by trigger; Mei-Ling Wong left cold at 45 days)`);

  // --- Key dates (loan book reminders) ----------------------------------------
  await seedKeyDate({
    deal_id: gasworks.id,
    label: "Insurance renewal",
    due_date: ahead(20),
    remind_days_before: 14,
  });
  await seedKeyDate(
    {
      deal_id: gasworks.id,
      label: "First interest payment due",
      due_date: addMonthsClamped(gasworksSettlement, 1),
      remind_days_before: 7,
    },
    true, // long past — completed
  );
  await seedKeyDate({
    deal_id: rosebery.id,
    label: "First interest payment due",
    due_date: addMonthsClamped(roseberySettlement, 1), // ~2 months ago, incomplete → overdue
    remind_days_before: 7,
  });
  console.log("Key dates: 3 (1 upcoming, 1 overdue, 1 completed)");

  // --- Drive links (links only — the CRM never touches files) ------------------
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
    parent_type: "broker",
    parent_id: sarah.id,
    label: "Aria Capital — Accreditation Pack",
    url: "https://drive.google.com/drive/folders/1AbCdEfGhIjKlMnOpQrStUvWxYz0123456",
  });
  console.log("Drive links: 3");

  console.log(`\nSeed complete — dates are relative to ${today} (Australia/Sydney).`);
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : String(err));
  process.exit(1);
});
