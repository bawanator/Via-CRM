# Vía OS

Internal broker & deal CRM for Vía Private. Single-user today, multi-user-ready by design.

It manages:

1. **Contacts** — every relationship, typed (Broker by default, plus Borrower / Solicitor / Valuer / Accountant / Referrer / … — types are data-driven and addable without code) and located (city, filterable). Brokers carry a four-stage origination pipeline (Introduced → Engaged → Active Submitter → Prime); other contact types don't.
2. **Deals** — live deals through a five-stage pipeline (Scenario → Term Sheet → Credit → Docs → Settlement) on a drag-and-drop board, deals that don't proceed moved to **Closed / Lost** with a required reason, and settled loans tracked in the **Loan Book** for the life of the term. Deals carry guarantors (up to 3) and borrower details.
3. **Tasks** — against contacts and deals, surfaced on the Today screen (and, later, synced to Google Tasks).
4. **Reports** — count-based origination metrics (deals submitted, live pipeline, outcomes/loss reasons, stage progression, activity), pinnable and buildable without code, and queryable by Claude/any LLM via MCP.

This is a tracking and visibility tool, **not** a loan servicing system. There is no calculation engine — it never computes balances, interest, or payments, and reports are counts/conversions only, never money sums. It holds dates, statuses, people, links, tasks, and reminders. The only arithmetic anywhere is `maturity_date = settlement_date + term months` (date arithmetic, done by a database trigger).

**Funders are code-named `1` / `2` / `3` throughout — the real funder names appear nowhere in the app or its display, so the CRM can't leak the capital stack if it's shoulder-surfed.**

## Stack

- **Frontend:** Next.js (App Router) on Vercel, TypeScript strict, Tailwind CSS v4. Installable PWA, clean white Apple-HIG surface (light only), drag-and-drop deal board (@dnd-kit), click-to-edit fields, mobile-first (tested at 390px).
- **Database:** Supabase Postgres. **This is its own Supabase project** (`likewwztdnzrwhkvtjpf`) **owned by the viaprivate.com.au Workspace org** — completely separate from the website and broker-portal projects. Nothing is shared with those systems.
- **Auth:** Supabase Auth, Google sign-in only, gated by an allowlist table. Every table carries `created_by`/`updated_by`.
- **Integrations:** Gmail (read-only), Google Drive (pasted links only), MCP server for Claude.

## Architecture decisions (the short list)

- **Invariants live in Postgres, not the app.** Enums are Postgres enums, FKs enforced, RLS on everything.
- **Audit is trigger-based** (`supabase/migrations/00001_init.sql`). Every insert/update/delete on brokers, deals, key_dates, drive_links, and interactions writes an `audit_log` row with before/after JSON — impossible to bypass, including writes from the MCP server. The change *source* (`ui` / `mcp` / `import` / `system`) is read from an `x-change-source` request header each client sets; absent/invalid values fall back to `system`.
- **Derived numbers are views.** `live_deal_count`, `total_deals_submitted`, `last_deal_outcome` come from the `broker_stats` view — computed on read, can never drift.
- **`last_contact_date` is maintained by a DB trigger** on interaction insert (chosen over app logic so MCP and import writes behave identically). A back-dated interaction never regresses the date.
- **One write path.** UI server actions, MCP tools, and the import script all call the same functions in `src/lib/crm/`.
- **Timezone:** "today" is computed in `Australia/Sydney` (`src/lib/dates.ts`), not server UTC.

## Setup

### 1. Supabase project

1. In the Vía Private Supabase org, create a **new project** (e.g. `via-os`).
2. Link and push the schema:
   ```sh
   npx supabase login
   npx supabase link --project-ref <YOUR-PROJECT-REF>
   npx supabase db push
   ```
   (Never mutate the schema outside `supabase/migrations/`.)

### 2. Google OAuth

One OAuth client powers sign-in **and** read-only Gmail sync:

1. In [Google Cloud Console](https://console.cloud.google.com) create (or reuse) a project → **APIs & Services → Credentials → Create OAuth client ID → Web application**.
2. Enable the **Gmail API** for the project (APIs & Services → Library).
3. On the OAuth consent screen add the scope `https://www.googleapis.com/auth/gmail.readonly` (plus email/profile). No send or modify scopes — ever.
4. Authorised redirect URIs: `https://<YOUR-PROJECT-REF>.supabase.co/auth/v1/callback` (and `http://127.0.0.1:54321/auth/v1/callback` for local dev).
5. In Supabase → Authentication → Providers → Google: paste the client ID/secret and enable.
6. In Supabase → Authentication → URL Configuration: set the site URL to your Vercel domain and add `https://<your-domain>/auth/callback` to the redirect allowlist.

Sign-in requests `access_type=offline&prompt=consent`, so Supabase returns a Google **refresh token**, which the auth callback stores in `google_oauth_tokens` for the nightly Gmail cron.

### 3. Environment

```sh
cp .env.example .env.local   # then fill in values
```

| Variable | Purpose |
| --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` / `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase project (Project Settings → API) |
| `SUPABASE_SERVICE_ROLE_KEY` | Server-only: cron, MCP, scripts |
| `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` | Same OAuth client Supabase uses; needed to refresh Gmail access tokens |
| `CRON_SECRET` | Long random string; Vercel sends it as a bearer token to cron routes |
| `MCP_ACTOR_EMAIL` | Allowlisted email the MCP server attributes writes to |

### 4. Allowlist yourself, seed, run

```sh
npm install
npm run allow -- hargobindbawa@gmail.com "Harry"   # add to allowlist
npm run seed                                        # optional: realistic dev data
npm run dev
```

Sign-ups aren't blocked at the Google level, but non-allowlisted users are bounced at the door and RLS means they can read/write nothing. Adding a second user later is one `npm run allow` command (and a role column when roles matter — the policies are structured for it).

## Deployment (Vercel)

1. Create a **new Vercel project** for this repo (do not attach it to the website project).
2. Add all env vars from the table above (Production + Preview).
3. `vercel.json` registers the nightly Gmail sync cron (`0 17 * * *` UTC = 3am–4am Sydney). Vercel automatically authenticates cron requests with `CRON_SECRET`.
4. Deploy. Then update the Supabase auth redirect URLs to the production domain (step 2.6).

On iPhone: open the site in Safari → Share → **Add to Home Screen**. It installs as a standalone app.

## Gmail sync (read-only)

- **Manual:** "Sync Recent Email" on any broker record with an email address pulls recent thread subjects/dates/snippets (never bodies) as `email` interactions, deep-linked back to Gmail.
- **Nightly:** `/api/cron/gmail-sync` does the same across all brokers with email addresses.
- Idempotent per `(broker, thread)`; re-syncs refresh threads that got new replies. Sync failures degrade gracefully and never block the UI.
- The CRM is an index into Gmail, not a copy of it.

## MCP server (drive the CRM from Claude)

```sh
claude mcp add via-os --env-file /path/to/.env.local -- npm run mcp --prefix /path/to/via-os
```

See `mcp/README.md` for Claude Desktop config and the full tool list (`list_brokers`, `get_broker`, `create_deal`, `settle_deal`, `whats_due`, `get_audit_history`, …). All MCP writes go through the same code path as the UI, so the audit log records them with `source = 'mcp'`.

## Attio import (one-time)

1. In Attio: open the **People** list → ⋯ menu → **Export as CSV**. (Optionally export Companies the same way.)
2. Optional stage mapping: a two-column CSV `email,stage` (stages: `introduced`, `engaged`, `active_submitter`, `prime`). Anything unmapped defaults to `introduced`. A `stage` column in the People export also works.
3. Dry run first — prints what would be created, writes nothing:
   ```sh
   npm run import:attio -- --people people.csv --stage-mapping stages.csv --dry-run
   ```
4. Real run: drop `--dry-run`. Idempotent on email address — running twice creates nothing new. Every imported row lands in the audit log with `source = 'import'`.

## Development

```sh
npm run dev          # dev server
npm run typecheck    # tsc --noEmit
npm test             # vitest (pure suites always run; DB suite needs local Supabase)
npm run lint
npm run icons        # regenerate PWA icons
```

DB-behaviour tests (audit triggers, maturity derivation, last-contact bump) run against a local stack:

```sh
npx supabase start
TEST_SUPABASE_URL=http://127.0.0.1:54321 TEST_SUPABASE_SERVICE_ROLE_KEY=<from supabase start output> npm test
```

## Non-goals (deliberately not built)

No interest/balance/payment calculations. No email sending. No file upload or Drive management (links only). No two-way Attio sync. No reporting dashboards. No borrower- or broker-facing anything. No push notifications (the Today view and in-app reminders are the notification system, v1).
