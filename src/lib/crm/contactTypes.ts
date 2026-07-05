import type { ContactTypeRow } from "@/lib/database.types";
import { assertOk, type Db } from "@/lib/crm/db";

// Contact types are a lookup table the user can extend without code. Ordered by
// `sort` (then name) so the picker shows Broker/Borrower/… in intended order.
export async function listContactTypes(db: Db): Promise<ContactTypeRow[]> {
  const { data, error } = await db.from("contact_types").select("*").order("sort").order("name");
  return assertOk(data, error, "Listing contact types");
}

export async function addContactType(db: Db, name: string, sort?: number): Promise<ContactTypeRow> {
  const insert: { name: string; sort?: number } = { name };
  if (sort != null) insert.sort = sort;
  const { data, error } = await db.from("contact_types").insert(insert).select().single();
  return assertOk(data, error, "Adding contact type");
}
