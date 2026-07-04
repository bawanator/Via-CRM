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

Brokers: `list_brokers`, `get_broker`, `create_broker`, `update_broker`,
`log_interaction`. Deals: `list_deals`, `get_deal`, `create_deal`,
`update_deal`, `move_deal_stage`, `settle_deal`. Dates & links:
`add_key_date`, `complete_key_date`, `add_drive_link`. Overviews:
`whats_due`, `get_audit_history`.

Records accept a UUID **or a (partial) name**; ambiguous names return the
candidate list so Claude can disambiguate. Stage promotions are only ever
*suggested* (in `create_deal` responses) — never applied automatically.
