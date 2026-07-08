// Read-only integrity audit of the live book. Checks global invariants —
// not just the records we touched.
import { config } from "dotenv";
import { createAdminClient } from "../src/lib/supabase/admin";
import { APP_TIMEZONE } from "../src/lib/dates";

config({ path: ".env.local" });

async function main() {
  const db = createAdminClient("system");
  let problems = 0;
  const flag = (msg: string) => { problems++; console.log(`  ✗ ${msg}`); };
  const ok = (msg: string) => console.log(`  ✓ ${msg}`);

  const { data: contacts } = await db.from("contacts").select("id, full_name, email, last_contact_date").range(0, 999);
  const { data: interactions } = await db.from("interactions").select("id, broker_id, deal_id, occurred_at").range(0, 1999);
  const { data: deals } = await db.from("deals").select("id, name, broker_id, status, loss_reason").range(0, 499);
  const { data: tasks } = await db.from("tasks").select("id, contact_id, deal_id").range(0, 999);
  const { data: guarantors } = await db.from("guarantors").select("id, deal_id").range(0, 199);
  const { data: links } = await db.from("drive_links").select("id, parent_type, parent_id").range(0, 499);
  const c = contacts!, i = interactions!, d = deals!, t = tasks!, g = guarantors!, l = links!;

  console.log(`counts: contacts=${c.length} interactions=${i.length} deals=${d.length} tasks=${t.length} guarantors=${g.length} links=${l.length}\n`);
  console.log("— referential integrity —");
  const cids = new Set(c.map((x) => x.id));
  const dids = new Set(d.map((x) => x.id));
  const orphanI = i.filter((x) => !cids.has(x.broker_id));
  const orphanIdeal = i.filter((x) => x.deal_id && !dids.has(x.deal_id));
  const orphanD = d.filter((x) => !cids.has(x.broker_id));
  const orphanT = t.filter((x) => (x.contact_id && !cids.has(x.contact_id)) || (x.deal_id && !dids.has(x.deal_id)));
  const orphanG = g.filter((x) => !dids.has(x.deal_id));
  const orphanL = l.filter((x) => (x.parent_type === "contact" ? !cids.has(x.parent_id) : !dids.has(x.parent_id)));
  orphanI.length ? flag(`${orphanI.length} interactions point at missing contacts`) : ok("all interactions → valid contact");
  orphanIdeal.length ? flag(`${orphanIdeal.length} interactions point at missing deals`) : ok("all interaction deal links valid");
  orphanD.length ? flag(`${orphanD.length} deals point at missing brokers: ${orphanD.map((x) => x.name).join(", ")}`) : ok("all deals → valid broker");
  orphanT.length ? flag(`${orphanT.length} tasks orphaned`) : ok("all tasks → valid parents");
  orphanG.length ? flag(`${orphanG.length} guarantors orphaned`) : ok("all guarantors → valid deal");
  orphanL.length ? flag(`${orphanL.length} drive links orphaned`) : ok("all drive links → valid parent");

  console.log("— merge fragments really gone —");
  const fragEmails = ["anuj@harbourmortgages.com.au","andrew@nwcfinance.com.au","david@meadowsadvisory.com.au","jordon@propertyarbitrage.co","julia@goforbroker.com.au","roscoe@grada.au","ngohl@gbcapital.com.au","rkrups@flnt.io","darnold@flnt.io"];
  const fragNames = new Set(["anuj","andrew","david","jordon","julia","roscoe","ngohl","rkrups","darnold","prasad patrick william"]);
  const staleFrag = c.filter((x) => fragNames.has(x.full_name.trim().toLowerCase()));
  staleFrag.length ? flag(`fragment names still present: ${staleFrag.map((x) => x.full_name).join(", ")}`) : ok("no fragment-named contacts remain");
  const byEmail = new Map(c.flatMap((x) => (x.email ? [[x.email, x.full_name] as const] : [])));
  const misplaced = fragEmails.filter((e) => !byEmail.has(e));
  misplaced.length ? flag(`merged emails missing entirely: ${misplaced.join(", ")}`) : ok("all 9 merged emails present on keeper contacts");
  for (const e of fragEmails) if (byEmail.has(e)) console.log(`      ${e} → ${byEmail.get(e)}`);

  console.log("— duplicate detection —");
  const emailCounts = new Map<string, number>();
  for (const x of c) if (x.email) emailCounts.set(x.email.toLowerCase(), (emailCounts.get(x.email.toLowerCase()) ?? 0) + 1);
  const dupEmails = [...emailCounts].filter(([, n]) => n > 1);
  dupEmails.length ? flag(`duplicate emails: ${dupEmails.map(([e]) => e).join(", ")}`) : ok("no duplicate emails");
  const nameCounts = new Map<string, number>();
  for (const x of c) nameCounts.set(x.full_name.trim().toLowerCase(), (nameCounts.get(x.full_name.trim().toLowerCase()) ?? 0) + 1);
  const dupNames = [...nameCounts].filter(([, n]) => n > 1);
  dupNames.length ? console.log(`  ! duplicate names (may be legitimate different people): ${dupNames.map(([n]) => n).join(", ")}`) : ok("no duplicate full names");

  console.log("— last_contact_date truthfulness (every contact) —");
  const sydneyDate = (iso: string) => new Intl.DateTimeFormat("en-CA", { timeZone: APP_TIMEZONE }).format(new Date(iso));
  const maxByContact = new Map<string, string>();
  for (const x of i) {
    const day = sydneyDate(x.occurred_at);
    const cur = maxByContact.get(x.broker_id);
    if (!cur || day > cur) maxByContact.set(x.broker_id, day);
  }
  let mismatches = 0;
  for (const x of c) {
    const expected = maxByContact.get(x.id) ?? null;
    if (expected !== (x.last_contact_date ?? null)) {
      mismatches++;
      if (mismatches <= 10) console.log(`      ${x.full_name}: stored=${x.last_contact_date} expected=${expected}`);
    }
  }
  mismatches ? flag(`${mismatches} contacts with wrong last_contact_date`) : ok(`last_contact_date correct for all ${c.length} contacts`);

  console.log("— deal invariants —");
  const badLost = d.filter((x) => (x.status === "lost") !== (x.loss_reason != null));
  badLost.length ? flag(`lost/loss_reason pairing broken: ${badLost.map((x) => x.name).join(", ")}`) : ok("lost ⇔ loss_reason pairing holds on all deals");

  console.log(problems === 0 ? "\nALL CHECKS PASSED" : `\n${problems} PROBLEM(S) FOUND`);
  process.exit(problems === 0 ? 0 : 1);
}
main();
