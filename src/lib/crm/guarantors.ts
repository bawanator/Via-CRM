import type { GuarantorInsert, GuarantorRow, GuarantorUpdate } from "@/lib/database.types";
import { assertOk, type Db } from "@/lib/crm/db";

// A deal may have at most 3 guarantors — the cap is enforced here in the app
// (there is no DB constraint for it).
export const MAX_GUARANTORS = 3;

export async function listGuarantors(db: Db, dealId: string): Promise<GuarantorRow[]> {
  const { data, error } = await db.from("guarantors").select("*").eq("deal_id", dealId).order("created_at");
  return assertOk(data, error, "Listing guarantors");
}

export async function addGuarantor(db: Db, input: GuarantorInsert): Promise<GuarantorRow> {
  const { count, error: countError } = await db
    .from("guarantors")
    .select("id", { count: "exact", head: true })
    .eq("deal_id", input.deal_id);
  if (countError) throw new Error(`Counting guarantors: ${countError.message}`);
  if ((count ?? 0) >= MAX_GUARANTORS) {
    throw new Error(`A deal can have at most ${MAX_GUARANTORS} guarantors.`);
  }
  const { data, error } = await db.from("guarantors").insert(input).select().single();
  return assertOk(data, error, "Adding guarantor");
}

export async function updateGuarantor(db: Db, id: string, input: GuarantorUpdate): Promise<GuarantorRow> {
  const { data, error } = await db.from("guarantors").update(input).eq("id", id).select().single();
  return assertOk(data, error, "Updating guarantor");
}

export async function deleteGuarantor(db: Db, id: string): Promise<void> {
  const { error } = await db.from("guarantors").delete().eq("id", id);
  if (error) throw new Error(`Deleting guarantor: ${error.message}`);
}
