import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import type { User } from "@supabase/supabase-js";

// Gate for every (app) page: signed in AND on the allowlist.
// Allowlist is enforced twice — here for UX, and by RLS for actual security.
export async function requireAllowedUser(): Promise<User> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  const { data: allowed } = await supabase
    .from("allowed_users")
    .select("email")
    .eq("email", (user.email ?? "").toLowerCase())
    .maybeSingle();

  if (!allowed) redirect("/login?error=not-allowed");

  return user;
}
