/**
 * Smoke test for QuickAdd: parse-event-batch + commit-event-batch.
 * Exercises BOTH modes: single (with attendees) and batch (multi-event).
 *
 * Usage: tsx scripts/smoke-quickadd.ts (requires `npx next dev -p 3010` running)
 */

import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { eq, and, like, gte } from "drizzle-orm";
import { randomBytes } from "node:crypto";
import bcrypt from "bcryptjs";
import path from "node:path";
import * as schema from "../drizzle/schema";
const { users, sessions, events } = schema;

const BASE = process.env.BASE_URL ?? "http://127.0.0.1:3010";
const sqlite = new Database(path.join(process.cwd(), "data", "fold.db"));
sqlite.pragma("journal_mode = WAL");
sqlite.pragma("foreign_keys = ON");
const db = drizzle(sqlite, { schema });

async function ensureUser(email: string, displayName: string) {
  let [u] = await db.select().from(users).where(eq(users.email, email)).limit(1);
  if (!u) {
    const passwordHash = await bcrypt.hash("smoketest", 10);
    [u] = await db.insert(users).values({ email, displayName, passwordHash }).returning();
  }
  return u;
}

async function mintCookie(userId: number) {
  const id = randomBytes(32).toString("hex");
  const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);
  await db.insert(sessions).values({ id, userId, expiresAt });
  return `fold_session=${id}`;
}

async function cleanup() {
  // Remove smoke-test events from prior runs (anything starting with SMOKETEST-).
  sqlite.prepare("DELETE FROM events WHERE name LIKE 'SMOKETEST-%'").run();
}

async function main() {
  await cleanup();
  const u = await ensureUser("smoke-quickadd@example.com", "Test Admin");
  const cookie = await mintCookie(u.id);

  // ---- Scenario 1: BATCH (multiple events, no attendees) ----
  console.log("\n=== Scenario 1: BATCH — 3 events at once ===");
  const batchInput =
    "create these events at Community Center: SMOKETEST-Weekly 9/4, SMOKETEST-Weekly 9/11, SMOKETEST-Social 9/14 at the park";
  const p1 = await fetch(BASE + "/api/parse-event-batch", {
    method: "POST",
    headers: { "content-type": "application/json", cookie },
    body: JSON.stringify({ text: batchInput }),
  });
  const p1Json = await p1.json();
  console.log("status:", p1.status, " mode:", p1Json.mode);
  if (p1.status !== 200) {
    console.log("error:", p1Json);
    process.exit(1);
  }
  if (p1Json.mode !== "batch") {
    console.log("❌ expected batch mode, got:", p1Json.mode);
    process.exit(1);
  }
  console.log("events:");
  for (const e of p1Json.events) {
    console.log(`  - ${e.name}  ${e.date}  type=${e.type ?? "?"}  loc=${e.location ?? "—"}`);
  }
  if (p1Json.events.length !== 3) {
    console.log(`❌ expected 3 events, got ${p1Json.events.length}`);
    process.exit(1);
  }

  const c1 = await fetch(BASE + "/api/commit-event-batch", {
    method: "POST",
    headers: { "content-type": "application/json", cookie },
    body: JSON.stringify({ mode: "batch", events: p1Json.events }),
  });
  const c1Json = await c1.json();
  console.log("commit:", c1.status, c1Json);

  const inserted = sqlite
    .prepare("SELECT COUNT(*) as c FROM events WHERE name LIKE 'SMOKETEST-%'")
    .get() as { c: number };
  console.log(`DB: ${inserted.c} SMOKETEST events present (expected 3)`);
  if (inserted.c !== 3) {
    console.log("❌ wrong count");
    process.exit(1);
  }
  console.log("✅ Scenario 1 passed");

  // ---- Scenario 2: SINGLE (one event with attendees) ----
  console.log("\n=== Scenario 2: SINGLE — one event + attendees ===");
  const singleInput =
    "add Jordan, Alex, Sam (new freshman) to new SMOKETEST-Social 9/20 at the park";
  const p2 = await fetch(BASE + "/api/parse-event-batch", {
    method: "POST",
    headers: { "content-type": "application/json", cookie },
    body: JSON.stringify({ text: singleInput }),
  });
  const p2Json = await p2.json();
  console.log("status:", p2.status, " mode:", p2Json.mode);
  if (p2Json.mode !== "single") {
    console.log("❌ expected single mode, got:", p2Json.mode);
    process.exit(1);
  }
  console.log("event:", p2Json.event);
  console.log(`attendees: ${p2Json.attendees?.length ?? 0}`);
  for (const a of p2Json.attendees ?? []) {
    const who = a.match === "existing" ? a._existingName ?? `#${a.studentId}` : `${a.firstName ?? ""} ${a.lastName ?? ""}`.trim();
    console.log(`  - ${a.match}: ${who}`);
  }

  const c2 = await fetch(BASE + "/api/commit-event-batch", {
    method: "POST",
    headers: { "content-type": "application/json", cookie },
    body: JSON.stringify({ mode: "single", event: p2Json.event, attendees: p2Json.attendees }),
  });
  const c2Json = await c2.json();
  console.log("commit:", c2.status, c2Json);
  if (c2.status !== 200 || !c2Json.eventId) {
    console.log("❌ single-event commit failed");
    process.exit(1);
  }
  console.log("✅ Scenario 2 passed");

  console.log("\n🎉 Both modes work end-to-end.");

  // Final cleanup of test data
  await cleanup();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
