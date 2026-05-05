import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { randomBytes } from "node:crypto";
import { sessions } from "../drizzle/schema";

const db = drizzle(new Database("./data/fold.db"));
const id = randomBytes(32).toString("hex");
db.insert(sessions)
  .values({ id, userId: 1, expiresAt: new Date(Date.now() + 86400_000) })
  .run();
console.log(id);
