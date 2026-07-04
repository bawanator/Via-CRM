import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
  test: {
    environment: "node",
    include: ["tests/**/*.test.ts"],
    // The db-behaviour suite talks to a local Supabase stack over HTTP.
    testTimeout: 15_000,
    hookTimeout: 30_000,
  },
});
