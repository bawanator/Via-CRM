// Vía OS MCP server — stdio entry point (Claude Code / Claude Desktop local).
//
//   npm run mcp        (tsx resolves the @/* tsconfig path alias)
//
// The tool registry lives in mcp/register.ts and is shared with the remote
// Streamable HTTP endpoint (src/app/api/mcp/[token]/route.ts) — one registry,
// two transports, one write path.
//
// Protocol note: stdout belongs to the stdio transport. Never console.log —
// all diagnostics go to stderr via console.error.
import path from "node:path";
import { fileURLToPath } from "node:url";
import { config } from "dotenv";

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
// quiet: dotenv v17 prints an "injected env" banner to stdout by default,
// which would corrupt the stdio JSON-RPC stream.
config({ path: path.join(REPO_ROOT, ".env.local"), quiet: true });
config({ path: path.join(REPO_ROOT, ".env"), quiet: true });

async function main(): Promise<void> {
  // Imported dynamically so dotenv runs before any module reads process.env.
  const { StdioServerTransport } = await import("@modelcontextprotocol/sdk/server/stdio.js");
  const { createAdminClient } = await import("@/lib/supabase/admin");
  const { buildServer, resolveActorId } = await import("./register");

  const db = createAdminClient("mcp");
  const actorId = await resolveActorId(db);
  const server = buildServer(db, actorId);
  await server.connect(new StdioServerTransport());
  console.error(
    `via-os mcp: ready on stdio (${actorId ? `actor ${process.env.MCP_ACTOR_EMAIL}` : "no actor"}, source=mcp)`,
  );
}

process.on("uncaughtException", (err) => {
  console.error("via-os mcp: uncaught exception:", err);
});
process.on("unhandledRejection", (reason) => {
  console.error("via-os mcp: unhandled rejection:", reason);
});

main().catch((err) => {
  console.error("via-os mcp: failed to start:", err);
  process.exit(1);
});
