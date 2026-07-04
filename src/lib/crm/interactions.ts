import type { InteractionInsert, InteractionRow } from "@/lib/database.types";
import { assertOk, type Db } from "@/lib/crm/db";

// Inserting an interaction bumps brokers.last_contact_date via DB trigger
// (see supabase/migrations/00001_init.sql — bump_last_contact).
export async function logInteraction(db: Db, input: InteractionInsert): Promise<InteractionRow> {
  const { data, error } = await db.from("interactions").insert(input).select().single();
  return assertOk(data, error, "Logging interaction");
}

export async function listInteractionsForDeal(db: Db, dealId: string): Promise<InteractionRow[]> {
  const { data, error } = await db
    .from("interactions")
    .select("*")
    .eq("deal_id", dealId)
    .order("occurred_at", { ascending: false })
    .limit(100);
  return assertOk(data, error, "Listing deal interactions");
}

export async function deleteInteraction(db: Db, id: string): Promise<void> {
  const { error } = await db.from("interactions").delete().eq("id", id);
  if (error) throw new Error(`Deleting interaction: ${error.message}`);
}
