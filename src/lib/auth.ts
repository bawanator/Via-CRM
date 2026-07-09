import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export type AllowedUser = { id: string; email: string };

// Gate for every (app) page: signed in AND on the allowlist.
// Allowlist is enforced twice — here for UX, and by RLS for actual security.
// Uses getClaims (local JWT verification) instead of getUser — the old version
// added a Supabase Auth round trip to every page render on top of the one the
// middleware was already making.
export async function requireAllowedUser(): Promise<AllowedUser> {
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  const claims = data?.claims;

  if (!claims) redirect("/login");
  const email = String(claims.email ?? "").toLowerCase();

  const { data: allowed } = await supabase.from("allowed_users").select("email").eq("email", email).maybeSingle();

  if (!allowed) redirect("/login?error=not-allowed");

  return { id: String(claims.sub), email };
}
