// POST /api/gmail/discover — manual reply-triggered contact discovery,
// triggered from the UI on demand. Scans the user's recent SENT mail and
// creates skeleton contacts (type "Other", company auto-linked by domain)
// for addresses the CRM doesn't know yet, then syncs their recent threads.
//
// Same auth pattern as /api/gmail/sync: signed-in user, their own Google
// refresh token via RLS. Read-only Gmail scope; a Gmail failure returns JSON,
// nothing throws to the client.

import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { discoverContactsFromSent, refreshAccessToken } from "@/lib/gmail";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

// Body is optional — {} is fine; bounds keep a manual run polite to Gmail.
const bodySchema = z.object({
  newer_than_days: z.number().int().min(1).max(365).optional(),
  max: z.number().int().min(1).max(100).optional(),
});

export async function POST(request: NextRequest) {
  if (process.env.ENABLE_GMAIL_DISCOVERY !== "true") {
    return NextResponse.json(
      { ok: false, error: "Contact discovery is switched off (set ENABLE_GMAIL_DISCOVERY=true to enable)." },
      { status: 403 },
    );
  }
  try {
    const supabase = await createClient();
    // Local JWT check (claims.sub = user id); RLS scopes the token row anyway.
    const { data: claimsData } = await supabase.auth.getClaims();
    const claims = claimsData?.claims;
    if (!claims) {
      return NextResponse.json({ ok: false, error: "Not signed in" }, { status: 401 });
    }

    const raw = await request.json().catch(() => ({}));
    const parsed = bodySchema.safeParse(raw ?? {});
    if (!parsed.success) {
      return NextResponse.json(
        { ok: false, error: "Invalid request — optional { newer_than_days, max }" },
        { status: 400 },
      );
    }

    // Own row via RLS — the refresh token stored by the auth callback.
    const { data: token, error: tokenError } = await supabase
      .from("google_oauth_tokens")
      .select("refresh_token")
      .eq("user_id", String(claims.sub))
      .maybeSingle();
    if (tokenError) {
      return NextResponse.json({ ok: false, error: `Loading Google token: ${tokenError.message}` }, { status: 502 });
    }
    if (!token?.refresh_token) {
      return NextResponse.json(
        { ok: false, error: "Google not connected — sign out and back in to grant Gmail access." },
        { status: 400 },
      );
    }

    const accessToken = await refreshAccessToken(token.refresh_token);
    const result = await discoverContactsFromSent(supabase, accessToken, {
      newerThanDays: parsed.data.newer_than_days,
      max: parsed.data.max,
    });
    return NextResponse.json({ ok: true, ...result });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Gmail discovery failed";
    console.error("Gmail discovery failed:", err);
    return NextResponse.json({ ok: false, error: message }, { status: 502 });
  }
}
