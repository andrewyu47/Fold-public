import { createClient } from "@libsql/client";
import { drizzle } from "drizzle-orm/libsql";
import bcrypt from "bcryptjs";
import { users, students, events, attendances } from "../drizzle/schema";
import { sql } from "drizzle-orm";

const client = createClient({
  url: process.env.TURSO_DATABASE_URL!,
  authToken: process.env.TURSO_AUTH_TOKEN,
});
const db = drizzle(client);

async function main() {
// 1. Create admin user
const hash = bcrypt.hashSync("password123", 10);
const [admin] = await db
  .insert(users)
  .values({ email: "admin@example.com", displayName: "Admin", passwordHash: hash })
  .returning();
console.log("Created user:", admin.email);

// 2. Create students
const studentData: Array<{
  firstName: string;
  lastName: string;
  gender: "M" | "F";
  year: "freshman" | "sophomore" | "junior" | "senior" | "grad";
}> = [
  { firstName: "Alex", lastName: "Rivera", gender: "M", year: "sophomore" },
  { firstName: "Jordan", lastName: "Chen", gender: "M", year: "junior" },
  { firstName: "Sam", lastName: "Taylor", gender: "M", year: "freshman" },
  { firstName: "Casey", lastName: "Park", gender: "F", year: "sophomore" },
  { firstName: "Morgan", lastName: "Lee", gender: "F", year: "junior" },
  { firstName: "Riley", lastName: "Kim", gender: "F", year: "freshman" },
  { firstName: "Avery", lastName: "Nguyen", gender: "F", year: "senior" },
  { firstName: "Dakota", lastName: "Smith", gender: "M", year: "freshman" },
  { firstName: "Quinn", lastName: "Williams", gender: "F", year: "sophomore" },
  { firstName: "Harper", lastName: "Jones", gender: "F", year: "junior" },
  { firstName: "Rowan", lastName: "Davis", gender: "M", year: "senior" },
  { firstName: "Sage", lastName: "Martinez", gender: "M", year: "sophomore" },
  { firstName: "Emery", lastName: "Garcia", gender: "F", year: "freshman" },
  { firstName: "Finley", lastName: "Brown", gender: "M", year: "junior" },
  { firstName: "Blake", lastName: "Wilson", gender: "M", year: "senior" },
  { firstName: "Reese", lastName: "Anderson", gender: "F", year: "sophomore" },
  { firstName: "Lennox", lastName: "Thomas", gender: "M", year: "freshman" },
  { firstName: "Skyler", lastName: "Jackson", gender: "F", year: "junior" },
  { firstName: "Kai", lastName: "White", gender: "M", year: "grad" },
  { firstName: "Kendall", lastName: "Harris", gender: "F", year: "senior" },
];

const createdStudents = await db
  .insert(students)
  .values(studentData.map((s) => ({ ...s, funnelStage: "active" as const })))
  .returning();
console.log(`Created ${createdStudents.length} students`);

// Set some invitedByStudentId relationships
const studentIds = createdStudents.map((s) => s.id);
for (let i = 5; i < studentIds.length; i += 3) {
  const inviterIdx = i % 5;
  await db.run(
    sql`UPDATE students SET invited_by_student_id = ${studentIds[inviterIdx]} WHERE id = ${studentIds[i]}`
  );
}
console.log("Set invitation relationships");

// 3. Create events
const eventData = [
  { name: "Weekly Meeting 10/5", startDate: new Date("2025-10-05T18:00:00") },
  { name: "Weekly Meeting 10/12", startDate: new Date("2025-10-12T18:00:00") },
  { name: "Welcome Night", startDate: new Date("2025-10-03T19:00:00") },
  { name: "Social Hangout", startDate: new Date("2025-10-08T17:00:00") },
  { name: "Study Group", startDate: new Date("2025-10-10T14:00:00") },
  { name: "Team Retreat", startDate: new Date("2025-10-19T09:00:00") },
  { name: "Workshop", startDate: new Date("2025-10-22T16:00:00") },
  { name: "End of Quarter Party", startDate: new Date("2025-11-15T18:00:00") },
];

const createdEvents = await db.insert(events).values(eventData).returning();
console.log(`Created ${createdEvents.length} events`);

// 4. Create attendance records (8-12 per event, randomized)
function seededRandom(seed: number) {
  let s = seed;
  return () => {
    s = (s * 1103515245 + 12345) & 0x7fffffff;
    return s / 0x7fffffff;
  };
}

const rand = seededRandom(42);
let attendanceCount = 0;

for (const evt of createdEvents) {
  const count = 8 + Math.floor(rand() * 5);
  const shuffled = [...studentIds].sort(() => rand() - 0.5);
  const attendeeIds = shuffled.slice(0, count);

  for (const sid of attendeeIds) {
    await db.insert(attendances).values({ studentId: sid, eventId: evt.id, recordedBy: admin.id });
    attendanceCount++;
  }
}
console.log(`Created ${attendanceCount} attendance records`);

client.close();
console.log("Seed complete.");
}

main();
