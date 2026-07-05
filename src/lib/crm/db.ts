import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/database.types";

// Every CRM function takes a client so UI (user-scoped, source=ui) and
// MCP/import/cron (service-role, source=mcp/import/system) share one code path.
export type Db = SupabaseClient<Database>;

export function assertOk<T>(data: T | null, error: { message: string } | null, context: string): T {
  if (error) throw new Error(`${context}: ${error.message}`);
  if (data == null) throw new Error(`${context}: no data returned`);
  return data;
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isUuid(s: string): boolean {
  return UUID_RE.test(s);
}

// Build a safe value for a PostgREST `.or()` ilike filter. In `.or()` the value
// grammar treats commas, parens and dots as structural, so the pattern must be
// double-quoted and quote/backslash-escaped — otherwise a search for
// "Smith, John" breaks the filter (and unquoted input could inject conditions).
// The inner %/_/\ are LIKE metacharacters, escaped so they match literally.
export function orIlikePattern(term: string): string {
  const like = `%${term.replace(/[\\%_]/g, "\\$&")}%`;
  return `"${like.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;
}
