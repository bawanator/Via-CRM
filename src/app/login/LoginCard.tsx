"use client";

import { useSearchParams } from "next/navigation";
import { useState } from "react";
import { createClient } from "@/lib/supabase/browser";

// Google is the only way in. Sign-in needs email/profile only. The read-only
// email-sync feature adds gmail.readonly — a Google "restricted" scope that
// triggers the unverified-app screen — so it's opt-in via env, off until the
// consent screen is verified. Flip NEXT_PUBLIC_ENABLE_GMAIL_SYNC=true to enable.
// Send/modify scopes are never requested.
const GMAIL_SYNC_ENABLED = process.env.NEXT_PUBLIC_ENABLE_GMAIL_SYNC === "true";
const SCOPES = GMAIL_SYNC_ENABLED
  ? "email profile https://www.googleapis.com/auth/gmail.readonly"
  : "email profile";

export function LoginCard() {
  const params = useSearchParams();
  const [busy, setBusy] = useState(false);
  const notAllowed = params.get("error") === "not-allowed";
  const authFailed = params.get("error") === "auth";

  async function signIn() {
    setBusy(true);
    const supabase = createClient();
    const { error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: {
        redirectTo: `${window.location.origin}/auth/callback`,
        scopes: SCOPES,
        // offline + consent only needed when we want a Gmail refresh token.
        ...(GMAIL_SYNC_ENABLED ? { queryParams: { access_type: "offline", prompt: "consent" } } : {}),
      },
    });
    if (error) setBusy(false);
  }

  return (
    <div className="w-full max-w-sm rounded-2xl bg-card p-8 text-center">
      <h1 className="text-title-1 mb-1 text-label">Vía OS</h1>
      <p className="text-subheadline mb-8 text-label-2">Broker &amp; deal CRM for Vía Private</p>

      {notAllowed ? (
        <p className="text-footnote mb-4 rounded-lg bg-red/10 px-3 py-2 text-red">
          That Google account isn&apos;t on the allowlist.
        </p>
      ) : null}
      {authFailed ? (
        <p className="text-footnote mb-4 rounded-lg bg-red/10 px-3 py-2 text-red">
          Sign-in didn&apos;t complete. Try again.
        </p>
      ) : null}

      <button
        onClick={signIn}
        disabled={busy}
        className="text-body pressable inline-flex min-h-11 w-full items-center justify-center gap-2.5 rounded-xl bg-blue font-semibold text-white disabled:opacity-40"
      >
        <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden>
          <path
            fill="currentColor"
            d="M21.35 11.1H12v3.8h5.35c-.5 2.5-2.6 3.9-5.35 3.9a5.9 5.9 0 1 1 0-11.8c1.5 0 2.85.55 3.9 1.45l2.85-2.85A9.86 9.86 0 0 0 12 2.1a9.9 9.9 0 1 0 0 19.8c5.7 0 9.5-4 9.5-9.65 0-.4-.05-.77-.15-1.15Z"
          />
        </svg>
        {busy ? "Opening Google…" : "Sign in with Google"}
      </button>
    </div>
  );
}
