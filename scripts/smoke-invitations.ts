/**
 * Smoke test for Feature 2: invitation capture + health metrics.
 *
 * 1. Verifies the parser extracts invitedByName and the route resolves it to a roster id.
 * 2. Verifies commit persists invitedByStudentId.
 * 3. Verifies pure metric functions over the resulting state.
 *
 * Usage: tsx scripts/smoke-invitations.ts (requires `npx next dev -p 3010` running)
 */

import { createClient } from "@libsql/client";
import { drizzle } from "drizzle-orm/libsql";
import { eq, like } from "drizzle-orm";
import { randomBytes } from "node:crypto";
import bcrypt from "bcryptjs";
import * as schema from "../drizzle/schema";
import {
  perStudentHealth,
  perEventHealth,
  topInviters,
  type StudentLite,
  type AttendanceLite,
} from "../src/lib/health-metrics";
const { users, sessions, students, attendances, events } = schema;

const BASE = process.env.BASE_URL ?? "http://127.0.0.1:3010";
const client = createClient({
  url: process.env.TURSO_DATABASE_URL!,
  authToken: process.env.TURSO_AUTH_TOKEN,
});
const db = drizzle(client, { schema });

async function ensureUser() {
  const email = "smoke-invites@example.com";
  let [u] = await db.select().from(users).where(eq(users.email, email)).limit(1);
  if (!u) {
    const passwordHash = await bcrypt.hash("smoketest", 10);
    [u] = await db.insert(users).values({ email, displayName: "Test Admin", passwordHash }).returning();
  }
  return u;
}

async function mintCookie(userId: number) {
  const id = randomBytes(32).toString("hex");
  await db.insert(sessions).values({ id, userId, expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000) });
  return `fold_session=${id}`;
}

async function cleanup() {
  // Null out any invited_by references pointing at smoke-test rows first
  await client.execute(
    "UPDATE students SET invited_by_student_id = NULL WHERE invited_by_student_id IN (SELECT id FROM students WHERE first_name LIKE 'INV-Smoke-%')"
  );
  // Wipe smoke-test events + students from prior runs
  await client.execute("DELETE FROM events WHERE name LIKE 'INV-SMOKE-%'");
  await client.execute("DELETE FROM students WHERE first_name LIKE 'INV-Smoke-%'");
}

async function ensureInviter() {
  const fn = "INV-Smoke-Mike";
  const ln = "Inviter";
  let [m] = await db
    .select()
    .from(students)
    .where(eq(students.firstName, fn))
    .limit(1);
  if (!m) {
    [m] = await db.insert(students).values({ firstName: fn, lastName: ln, gender: "M", year: "senior" }).returning();
  }
  return m;
}

async function main() {
  await cleanup();
  const u = await ensureUser();
  const cookie = await mintCookie(u.id);
  const mike = await ensureInviter();

  console.log(`Inviter pre-seeded: ${mike.firstName} ${mike.lastName} (#${mike.id})`);

  // === Step 1: parse + commit a single event with an invitee ===
  const text = `add INV-Smoke-Tony Ho (freshman bro, brought by ${mike.firstName} ${mike.lastName}) to new INV-SMOKE-Outreach 9/20 at the park`;
  console.log("\n=== Step 1: parse ===");
  const p = await fetch(BASE + "/api/parse-event-batch", {
    method: "POST",
    headers: { "content-type": "application/json", cookie },
    body: JSON.stringify({ text }),
  });
  const pJson = await p.json();
  console.log("status:", p.status, " mode:", pJson.mode);
  if (pJson.mode !== "single") {
    console.error("expected single mode");
    process.exit(1);
  }
  const att = pJson.attendees?.[0];
  console.log("attendee:", att);
  if (att?.invitedById !== mike.id) {
    console.error(`❌ invitedById not resolved. Expected ${mike.id}, got ${att?.invitedById}.`);
    process.exit(1);
  }
  console.log("✅ parser resolved invitedById to existing Mike Inviter");

  console.log("\n=== Step 2: commit ===");
  const c = await fetch(BASE + "/api/commit-event-batch", {
    method: "POST",
    headers: { "content-type": "application/json", cookie },
    body: JSON.stringify({ mode: "single", event: pJson.event, attendees: pJson.attendees }),
  });
  const cJson = await c.json();
  console.log("commit:", c.status, cJson);

  // Look up Tony via the attendance row for the just-created event.
  const [attRow] = await db
    .select({ studentId: attendances.studentId })
    .from(attendances)
    .where(eq(attendances.eventId, cJson.eventId))
    .limit(1);
  const [tony] = await db
    .select()
    .from(students)
    .where(eq(students.id, attRow.studentId))
    .limit(1);
  console.log(`Tony row → id=${tony.id}, name=${tony.firstName} ${tony.lastName ?? ""}, invitedByStudentId=${tony.invitedByStudentId}`);
  if (tony.invitedByStudentId !== mike.id) {
    console.error("❌ commit didn't persist invitedByStudentId");
    process.exit(1);
  }
  console.log("✅ commit persisted invitedByStudentId");

  // === Step 3: pure metric functions ===
  console.log("\n=== Step 3: pure metric functions ===");
  const allStudentRows = await db
    .select({
      id: students.id,
      firstName: students.firstName,
      lastName: students.lastName,
      invitedByStudentId: students.invitedByStudentId,
    })
    .from(students);
  const allAttendanceRows = await db
    .select({ studentId: attendances.studentId, eventId: attendances.eventId, recordedAt: attendances.recordedAt })
    .from(attendances);

  const sLite: StudentLite[] = allStudentRows.map((s) => ({
    id: s.id,
    firstName: s.firstName,
    lastName: s.lastName,
    invitedByStudentId: s.invitedByStudentId ?? null,
  }));
  const aLite: AttendanceLite[] = allAttendanceRows.map((a) => ({
    studentId: a.studentId,
    eventId: a.eventId,
    recordedAt: new Date(a.recordedAt),
  }));

  const healthMap = perStudentHealth(sLite, aLite);
  const mikeHealth = healthMap.get(mike.id)!;
  console.log(`Mike health: friendsBrought=${mikeHealth.friendsBrought}, tier=${mikeHealth.inviterTier}`);
  if (mikeHealth.friendsBrought < 1) {
    console.error("❌ expected Mike to have at least 1 friend brought");
    process.exit(1);
  }

  const [evt] = await db.select().from(events).where(eq(events.id, cJson.eventId)).limit(1);
  const eventHealth = perEventHealth({ id: evt.id, startDate: new Date(evt.startDate) }, aLite, sLite);
  console.log(`Event ${evt.name} → newAttendees=${eventHealth.newAttendees}, invitedNew=${eventHealth.invitedNewAttendees}, ratio=${eventHealth.inviteRatio.toFixed(2)}`);
  if (eventHealth.invitedNewAttendees < 1) {
    console.error("❌ expected at least 1 invited new attendee");
    process.exit(1);
  }

  const inviters = topInviters(sLite, aLite);
  const mikeInList = inviters.find((i) => i.studentId === mike.id);
  console.log(`Top inviters (last 90d):`, inviters.slice(0, 3).map((i) => `${i.name} (${i.count}, ${i.tier})`));
  if (!mikeInList) {
    console.error("❌ expected Mike in topInviters");
    process.exit(1);
  }
  console.log("✅ all metric functions return expected values");

  console.log("\n🎉 Feature 2 smoke test passed.");

  // Final cleanup
  await client.execute({ sql: "DELETE FROM events WHERE id = ?", args: [cJson.eventId] });
  await client.execute({ sql: "DELETE FROM students WHERE id = ?", args: [tony.id] });
  await client.execute("DELETE FROM students WHERE first_name LIKE 'INV-Smoke-%'");
}

main().catch((e) => { console.error(e); process.exit(1); });
