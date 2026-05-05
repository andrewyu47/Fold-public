import { createClient } from "@libsql/client";
import { drizzle } from "drizzle-orm/libsql";
import { randomBytes } from "node:crypto";
import { sessions } from "../drizzle/schema";

const client = createClient({
  url: process.env.TURSO_DATABASE_URL!,
  authToken: process.env.TURSO_AUTH_TOKEN,
});
const db = drizzle(client);

const id = randomBytes(32).toString("hex");
await db.insert(sessions)
  .values({ id, userId: 1, expiresAt: new Date(Date.now() + 86400_000) });
console.log(id);
