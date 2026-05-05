/**
 * Smoke test for /api/students/[id]/draft-outreach.
 * Picks a real student with some context, mints a session, asks Claude for drafts.
 *
 * Usage: tsx scripts/smoke-draft.ts (requires `npx next dev -p 3010` running)
 */

import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { eq, desc } from "drizzle-orm";
import { randomBytes } from "node:crypto";
import bcrypt from "bcryptjs";
import path from "node:path";
import * as schema from "../drizzle/schema";
const { users, sessions, students } = schema;

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

async function main() {
  const u = await ensureUser("smoke-draft@example.com", "Test Admin");
  const cookie = await mintCookie(u.id);

  // Pick a student that has notes or contact attempts so Claude has something to lean on.
  const candidates = await db
    .select()
    .from(students)
    .orderBy(desc(students.updatedAt))
    .limit(40);
  const pick =
    candidates.find((s) => (s.notes && s.notes.length > 30) || s.firstMetContext || s.goals) ??
    candidates[0];
  if (!pick) {
    console.error("No students in DB to test against.");
    process.exit(1);
  }

  console.log(`Testing draft for student #${pick.id}: ${pick.firstName} ${pick.lastName ?? ""}`);
  console.log(`  funnelStage=${pick.funnelStage}  year=${pick.year ?? "?"}`);
  console.log(`  notes=${(pick.notes ?? "").slice(0, 80)}${(pick.notes ?? "").length > 80 ? "…" : ""}`);
  console.log(`  firstMetContext=${pick.firstMetContext ?? "—"}`);

  // Scenario A: IG DM, generic check-in
  console.log("\n=== A) IG DM, no purpose specified ===");
  const a = await fetch(`${BASE}/api/students/${pick.id}/draft-outreach`, {
    method: "POST",
    headers: { "content-type": "application/json", cookie },
    body: JSON.stringify({ channel: "ig_dm" }),
  });
  const aJson = await a.json();
  console.log("status:", a.status);
  if (a.status === 200) {
    console.log("explanation:", aJson.explanation);
    console.log("drafts:");
    for (const d of aJson.drafts ?? []) {
      console.log(`\n  [${d.label}]`);
      console.log(`  ${d.body.split("\n").join("\n  ")}`);
    }
  } else {
    console.log("error:", aJson);
    process.exit(1);
  }

  // Scenario B: text, specific invite
  console.log("\n\n=== B) Text, specific BBQ invite ===");
  const b = await fetch(`${BASE}/api/students/${pick.id}/draft-outreach`, {
    method: "POST",
    headers: { "content-type": "application/json", cookie },
    body: JSON.stringify({
      channel: "text",
      purpose: "Invite them to BBQ this Saturday at 3pm at Aquatic Park.",
    }),
  });
  const bJson = await b.json();
  console.log("status:", b.status);
  if (b.status === 200) {
    console.log("explanation:", bJson.explanation);
    console.log("drafts:");
    for (const d of bJson.drafts ?? []) {
      console.log(`\n  [${d.label}]`);
      console.log(`  ${d.body.split("\n").join("\n  ")}`);
    }
  } else {
    console.log("error:", bJson);
    process.exit(1);
  }

  // Scenario C: refinement on B
  console.log("\n\n=== C) Refinement: 'shorter and more casual' ===");
  const c = await fetch(`${BASE}/api/students/${pick.id}/draft-outreach`, {
    method: "POST",
    headers: { "content-type": "application/json", cookie },
    body: JSON.stringify({
      channel: "text",
      purpose: "Invite them to BBQ this Saturday at 3pm at Aquatic Park.",
      refinement: "shorter and more casual",
    }),
  });
  const cJson = await c.json();
  console.log("status:", c.status);
  if (c.status === 200) {
    console.log("drafts:");
    for (const d of cJson.drafts ?? []) {
      console.log(`\n  [${d.label}]`);
      console.log(`  ${d.body.split("\n").join("\n  ")}`);
    }
  } else {
    console.log("error:", cJson);
    process.exit(1);
  }

  console.log("\n🎉 All scenarios returned drafts.");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
