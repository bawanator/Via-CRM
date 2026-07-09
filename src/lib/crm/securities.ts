import type { DealSecurityInsert, DealSecurityRow, DealSecurityUpdate } from "@/lib/database.types";
import { assertOk, type Db } from "@/lib/crm/db";

// Securities on a deal — the property addresses backing the loan. A deal can
// hold any number; they add/remove like guarantors.

export async function listSecurities(db: Db, dealId: string): Promise<DealSecurityRow[]> {
  const { data, error } = await db.from("deal_securities").select("*").eq("deal_id", dealId).order("created_at");
  return assertOk(data, error, "Listing securities");
}

export async function addSecurity(db: Db, input: DealSecurityInsert): Promise<DealSecurityRow> {
  const { data, error } = await db.from("deal_securities").insert(input).select().single();
  return assertOk(data, error, "Adding security");
}

export async function updateSecurity(db: Db, id: string, input: DealSecurityUpdate): Promise<DealSecurityRow> {
  const { data, error } = await db.from("deal_securities").update(input).eq("id", id).select().single();
  return assertOk(data, error, "Updating security");
}

export async function deleteSecurity(db: Db, id: string): Promise<void> {
  const { error } = await db.from("deal_securities").delete().eq("id", id);
  if (error) throw new Error(`Deleting security: ${error.message}`);
}
