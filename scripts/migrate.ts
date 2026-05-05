import { createClient } from "@libsql/client";
import { drizzle } from "drizzle-orm/libsql";
import { migrate } from "drizzle-orm/libsql/migrator";
import path from "node:path";

const client = createClient({
  url: process.env.TURSO_DATABASE_URL!,
  authToken: process.env.TURSO_AUTH_TOKEN,
});

const db = drizzle(client);

async function main() {
  await migrate(db, { migrationsFolder: path.join(process.cwd(), "drizzle/migrations") });
  console.log("✓ migrated");
}

main();
