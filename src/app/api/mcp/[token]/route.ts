// Remote MCP endpoint — Streamable HTTP transport for claude.ai custom
// connectors (which sync to the Claude desktop and mobile apps).
//
// Same tool registry as the stdio server (mcp/register.ts): every write goes
// through src/lib/crm on a service-role client tagged source="mcp".
//
// Auth: the URL path segment IS the credential (capability URL) — claude.ai's
// connector UI takes a URL and nothing else, so a 256-bit secret in the path
// is the single-user-appropriate scheme. Constant-time compare; a miss
// returns 404 so the endpoint's existence is never confirmed. Rotate by
// changing MCP_HTTP_TOKEN (Vercel env) and updating the connector URL.

import { timingSafeEqual } from "node:crypto";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";
import { createAdminClient } from "@/lib/supabase/admin";
import { buildServer, resolveActorId } from "../../../../../mcp/register";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

function tokenMatches(candidate: string): boolean {
  const secret = process.env.MCP_HTTP_TOKEN;
  if (!secret || secret.length < 32) return false; // unset/weak secret → endpoint off
  const a = Buffer.from(candidate);
  const b = Buffer.from(secret);
  return a.length === b.length && timingSafeEqual(a, b);
}

// Actor lookup (one Supabase admin call) cached per warm instance.
let cachedActorId: string | null | undefined;

async function handle(request: Request, { params }: { params: Promise<{ token: string }> }): Promise<Response> {
  const { token } = await params;
  if (!tokenMatches(token)) return new Response("Not found", { status: 404 });

  const db = createAdminClient("mcp");
  if (cachedActorId === undefined) cachedActorId = await resolveActorId(db);

  // Stateless mode: a fresh server + transport per request, no session state —
  // the serverless-friendly shape of Streamable HTTP (GET/DELETE return 405).
  const server: McpServer = buildServer(db, cachedActorId);
  const transport = new WebStandardStreamableHTTPServerTransport({
    sessionIdGenerator: undefined,
    enableJsonResponse: true,
  });
  await server.connect(transport);
  return transport.handleRequest(request);
}

export { handle as GET, handle as POST, handle as DELETE };
