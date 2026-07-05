// POST /api/gmail/sync — manual per-broker Gmail sync, triggered from the UI.
// Read-only: pulls thread metadata (subject/date/snippet/thread id) into
// interactions. A Gmail failure must never take anything else down — every
// path returns JSON, nothing throws to the client.

import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { refreshAccessToken, syncBrokerGmail } from "@/lib/gmail";

export const dynamic = "force-dynamic";

const bodySchema = z.object({ brokerId: z.string().uuid() });

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ ok: false, error: "Not signed in" }, { status: 401 });
    }

    const parsed = bodySchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) {
      return NextResponse.json({ ok: false, error: "Invalid request — expected { brokerId }" }, { status: 400 });
    }

    // Own row via RLS — the refresh token stored by the auth callback.
    const { data: token, error: tokenError } = await supabase
      .from("google_oauth_tokens")
      .select("refresh_token")
      .eq("user_id", user.id)
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

    const { data: broker, error: brokerError } = await supabase
      .from("contacts")
      .select("id, email")
      .eq("id", parsed.data.brokerId)
      .maybeSingle();
    if (brokerError) {
      return NextResponse.json({ ok: false, error: `Loading broker: ${brokerError.message}` }, { status: 502 });
    }
    if (!broker) {
      return NextResponse.json({ ok: false, error: "Broker not found" }, { status: 404 });
    }
    if (!broker.email) {
      return NextResponse.json(
        { ok: false, error: "This broker has no email address — add one first." },
        { status: 400 },
      );
    }

    const accessToken = await refreshAccessToken(token.refresh_token);
    const synced = await syncBrokerGmail(supabase, { id: broker.id, email: broker.email }, accessToken);
    return NextResponse.json({ ok: true, synced });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Gmail sync failed";
    console.error("Gmail sync failed:", err);
    return NextResponse.json({ ok: false, error: message }, { status: 502 });
  }
}
