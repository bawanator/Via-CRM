import type { DriveLinkInsert, DriveLinkRow, LinkParentType } from "@/lib/database.types";
import { assertOk, type Db } from "@/lib/crm/db";

// Link-only by design: the CRM never uploads, moves, or manages files.
export async function addDriveLink(db: Db, input: DriveLinkInsert): Promise<DriveLinkRow> {
  const { data, error } = await db.from("drive_links").insert(input).select().single();
  return assertOk(data, error, "Adding drive link");
}

export async function listDriveLinks(db: Db, parentType: LinkParentType, parentId: string): Promise<DriveLinkRow[]> {
  const { data, error } = await db
    .from("drive_links")
    .select("*")
    .eq("parent_type", parentType)
    .eq("parent_id", parentId)
    .order("created_at");
  return assertOk(data, error, "Listing drive links");
}

export async function deleteDriveLink(db: Db, id: string): Promise<void> {
  const { error } = await db.from("drive_links").delete().eq("id", id);
  if (error) throw new Error(`Deleting drive link: ${error.message}`);
}
