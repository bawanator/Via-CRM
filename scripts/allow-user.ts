// Add (or list) allowlisted users. The app is multi-user-ready; shipping
// config is a single allowlisted email.
//
//   npm run allow -- someone@example.com "Full Name"
//   npm run allow -- --list
import { config } from "dotenv";
import { createAdminClient } from "../src/lib/supabase/admin";

config({ path: ".env.local" });
config();

async function main() {
  const args = process.argv.slice(2);
  const db = createAdminClient("system");

  if (args[0] === "--list" || args.length === 0) {
    const { data, error } = await db.from("allowed_users").select("*").order("created_at");
    if (error) throw new Error(error.message);
    if (!data.length) console.log("Allowlist is empty.");
    for (const row of data) console.log(`- ${row.email}${row.full_name ? ` (${row.full_name})` : ""}`);
    return;
  }

  const email = args[0].toLowerCase();
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
    console.error(`Not a valid email: ${email}`);
    process.exit(1);
  }
  const { error } = await db.from("allowed_users").upsert({ email, full_name: args[1] ?? null });
  if (error) throw new Error(error.message);
  console.log(`Allowlisted ${email}`);
}

main().catch((err) => {
  console.error(err.message);
  process.exit(1);
});
