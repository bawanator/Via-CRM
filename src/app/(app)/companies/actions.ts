"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { updateCompany } from "@/lib/crm/companies";
import { companyUpdateSchema } from "@/lib/schemas";

type ActionResult = { ok: true; id?: string } | { ok: false; error: string };

const uuidSchema = z.string().uuid();

// Inline saves from the company record page (name / domain / location / notes).
// Everything parses through companyUpdateSchema — the same boundary the MCP
// tools use — so a bad domain or empty name never reaches the database.
export async function updateCompanyAction(id: string, fields: unknown): Promise<ActionResult> {
  const idParsed = uuidSchema.safeParse(id);
  if (!idParsed.success) return { ok: false, error: "Invalid company id" };
  const parsed = companyUpdateSchema.safeParse(fields);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input" };
  try {
    const supabase = await createClient();
    await updateCompany(supabase, idParsed.data, parsed.data);
    revalidatePath("/companies");
    revalidatePath(`/companies/${idParsed.data}`);
    return { ok: true, id: idParsed.data };
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Could not save the company";
    if (/duplicate key|already exists/i.test(msg)) {
      return { ok: false, error: "Another company already uses that name or domain" };
    }
    return { ok: false, error: msg };
  }
}
