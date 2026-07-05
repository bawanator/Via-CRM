# Vía OS MCP server

Drives the whole CRM from Claude over stdio. Every write goes through the same
`src/lib/crm` functions as the UI and lands in the audit log with
**source = "mcp"**, attributed to the user in `MCP_ACTOR_EMAIL`.

## Environment

Loaded from the repo root's `.env.local` then `.env` (or pass explicitly):

| Variable | Purpose |
| --- | --- |
| `SUPABASE_URL` (or `NEXT_PUBLIC_SUPABASE_URL`) | Supabase project URL |
| `SUPABASE_SERVICE_ROLE_KEY` | Service-role key (server-side only, bypasses RLS) |
| `MCP_ACTOR_EMAIL` | Email of the auth user writes are attributed to (e.g. `hargobindbawa@gmail.com`) |

If the actor email can't be matched to an auth user, the server warns on
stderr and keeps running; writes then have no per-user attribution (audit
source remains "mcp").

## Register in Claude Code

```sh
claude mcp add via-os -- npm run mcp --prefix /Users/harry/Coding/CRM
```

## Register in Claude Desktop

Add to `~/Library/Application Support/Claude/claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "via-os": {
      "command": "/Users/harry/Coding/CRM/node_modules/.bin/tsx",
      "args": ["/Users/harry/Coding/CRM/mcp/server.ts"],
      "env": {
        "SUPABASE_URL": "https://YOUR-PROJECT.supabase.co",
        "SUPABASE_SERVICE_ROLE_KEY": "YOUR-SERVICE-ROLE-KEY",
        "MCP_ACTOR_EMAIL": "hargobindbawa@gmail.com"
      }
    }
  }
}
```

The `env` block is optional if the repo's `.env.local` already has the values —
the server loads it by absolute path, so any working directory works.

## Tools

Contacts: `list_contacts`, `get_contact`, `create_contact`, `update_contact`.
Brokers (thin aliases defaulting the contact type to Broker): `list_brokers`,
`get_broker`, `create_broker`, `update_broker`. `log_interaction`.

Deals: `list_deals` (filter by status `live|settled|lost`, pipeline stage,
funder, or broker), `get_deal` (includes guarantors, key dates, and Drive
links), `create_deal`, `update_deal`, `move_deal_stage`, `settle_deal`,
`lose_deal` (requires a loss reason). Guarantors: `add_guarantor` (max 3 per
deal, others via `get_deal`).

Tasks: `list_tasks`, `create_task`, `complete_task`. Dates & links:
`add_key_date`, `complete_key_date`, `add_drive_link` (`parent_type` is
`deal` or `contact`).

Reports (COUNTS and conversions only — never money): `run_report`
(metrics `deals_submitted`, `deals_by_stage`, `deals_by_outcome`,
`stage_progression`, `activity`), `save_report`, `list_reports`,
`delete_report`, `set_report_pinned` (max 3 pinned). Contact types:
`list_contact_types`, `add_contact_type`.

Overviews: `whats_due` (now includes open tasks), `get_audit_history`.

Records accept a UUID **or a (partial) name**; ambiguous names return the
candidate list so Claude can disambiguate. Funders are code-named — only
`funder_1/2/3` ever appear, never a real name. Stage promotions are only ever
*suggested* (in `create_deal` responses) — never applied automatically.
