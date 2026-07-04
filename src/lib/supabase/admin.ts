import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import type { ChangeSource, Database } from "@/lib/database.types";

// Service-role client. Bypasses RLS — server-side only (cron, MCP, scripts).
// Callers must declare their change source so audit rows are attributed.
export function createAdminClient(source: Exclude<ChangeSource, "ui">) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new Error("Missing SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY environment variables");
  }
  return createSupabaseClient<Database>(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { headers: { "x-change-source": source } },
  });
}
