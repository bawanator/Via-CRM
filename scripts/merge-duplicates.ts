// One-off merge of import-created duplicate pairs: Attio often held the same
// human as a name-only row AND an email-only row; the import couldn't join
// them. Curated pairs only — the named contact absorbs the email fragment:
// interactions/deals/tasks move across, the email + missing fields copy over,
// the fragment is deleted. Moving interactions re-fires bump_last_contact, so
// "gone cold" dates become truthful.
//
//   npx tsx scripts/merge-duplicates.ts [--dry-run]
import { config } from "dotenv";
import { createAdminClient } from "../src/lib/supabase/admin";

config({ path: ".env.local" });
config();

const DRY = process.argv.includes("--dry-run");

// keeper full_name ← fragment email
const PAIRS: { keeper: string; fragmentEmail: string }[] = [
  { keeper: "Anuj Rajput", fragmentEmail: "anuj@harbourmortgages.com.au" },
  { keeper: "Andrew Oey", fragmentEmail: "andrew@nwcfinance.com.au" },
  { keeper: "David Meadows", fragmentEmail: "david@meadowsadvisory.com.au" },
  { keeper: "Jordon Barnett", fragmentEmail: "jordon@propertyarbitrage.co" },
  { keeper: "Julia Paton", fragmentEmail: "julia@goforbroker.com.au" },
  { keeper: "Roscoe Power", fragmentEmail: "roscoe@grada.au" },
  { keeper: "Nigel Gohl", fragmentEmail: "ngohl@gbcapital.com.au" },
  { keeper: "Robert Krups", fragmentEmail: "rkrups@flnt.io" },
  { keeper: "Dylan Arnold", fragmentEmail: "darnold@flnt.io" },
];

// Pure duplicates (same human twice, neither has an email): delete the second.
const NAME_DUPES: { keep: string; remove: string }[] = [
  { keep: "Patrick Prasad William", remove: "Prasad Patrick William" },
];

async function main() {
  const db = createAdminClient("import");

  for (const { keeper, fragmentEmail } of PAIRS) {
    const { data: keepers } = await db.from("contacts").select("*").ilike("full_name", keeper);
    const { data: fragments } = await db.from("contacts").select("*").eq("email", fragmentEmail);
    if (!keepers?.length || !fragments?.length) {
      console.log(`skip: ${keeper} ← ${fragmentEmail} (missing side)`);
      continue;
    }
    const keep = keepers[0];
    const frag = fragments[0];
    if (keep.id === frag.id) continue;

    const { count: nInter } = await db.from("interactions").select("id", { count: "exact", head: true }).eq("broker_id", frag.id);
    const { count: nDeals } = await db.from("deals").select("id", { count: "exact", head: true }).eq("broker_id", frag.id);
    console.log(`${keeper} ← ${frag.full_name} <${fragmentEmail}> (${nInter ?? 0} interactions, ${nDeals ?? 0} deals)`);
    if (DRY) continue;

    // 1. Move children to the keeper (interaction updates re-bump last_contact).
    for (const [table, col] of [["interactions", "broker_id"], ["deals", "broker_id"], ["tasks", "contact_id"]] as const) {
      const { error } = await db.from(table).update({ [col]: keep.id }).eq(col, frag.id);
      if (error) throw new Error(`Moving ${table} for ${keeper}: ${error.message}`);
    }
    // 2. Move drive links (polymorphic parent).
    await db.from("drive_links").update({ parent_id: keep.id }).eq("parent_type", "contact").eq("parent_id", frag.id);
    // 3. Delete the fragment BEFORE claiming its email (unique index on lower(email)).
    const { error: delError } = await db.from("contacts").delete().eq("id", frag.id);
    if (delError) throw new Error(`Deleting fragment for ${keeper}: ${delError.message}`);
    // 4. Enrich the keeper with whatever the fragment had and the keeper lacked.
    const { error: upError } = await db
      .from("contacts")
      .update({
        email: keep.email ?? fragmentEmail,
        company_id: keep.company_id ?? frag.company_id,
        phone: keep.phone ?? frag.phone,
        location: keep.location ?? frag.location,
        notes: keep.notes ?? frag.notes,
      })
      .eq("id", keep.id);
    if (upError) throw new Error(`Updating keeper ${keeper}: ${upError.message}`);
  }

  for (const { keep, remove } of NAME_DUPES) {
    const { data } = await db.from("contacts").select("id, email").ilike("full_name", remove);
    if (!data?.length) {
      console.log(`skip name-dupe: ${remove} not found`);
      continue;
    }
    console.log(`delete duplicate: ${remove} (keeping ${keep})`);
    if (!DRY) {
      const { error } = await db.from("contacts").delete().eq("id", data[0].id);
      if (error) throw new Error(`Deleting ${remove}: ${error.message}`);
    }
  }

  console.log(DRY ? "\nDry run — nothing changed." : "\nMerge complete.");
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
