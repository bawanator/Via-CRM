import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";

// OAuth code exchange. Also captures the Google refresh token (for the
// nightly Gmail sync) and enforces the allowlist before letting anyone in.
export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  const next = searchParams.get("next") ?? "/";

  if (!code) {
    return NextResponse.redirect(`${origin}/login?error=auth`);
  }

  const supabase = await createClient();
  const { data, error } = await supabase.auth.exchangeCodeForSession(code);

  if (error || !data.session) {
    return NextResponse.redirect(`${origin}/login?error=auth`);
  }

  const { session, user } = data;

  // Allowlist check before anything else.
  const { data: allowed } = await supabase
    .from("allowed_users")
    .select("email")
    .eq("email", (user.email ?? "").toLowerCase())
    .maybeSingle();

  if (!allowed) {
    await supabase.auth.signOut();
    return NextResponse.redirect(`${origin}/login?error=not-allowed`);
  }

  // Google only returns a refresh token on consent — store it when we get one.
  // RLS restricts this table to the user's own row.
  if (session.provider_refresh_token) {
    await supabase.from("google_oauth_tokens").upsert({
      user_id: user.id,
      refresh_token: session.provider_refresh_token,
    });
  }

  return NextResponse.redirect(`${origin}${next.startsWith("/") ? next : "/"}`);
}
