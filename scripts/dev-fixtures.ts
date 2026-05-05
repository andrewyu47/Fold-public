import { createClient } from "@libsql/client";
import { drizzle } from "drizzle-orm/libsql";
import { events, students, attendances } from "../drizzle/schema";

const client = createClient({
  url: process.env.TURSO_DATABASE_URL!,
  authToken: process.env.TURSO_AUTH_TOKEN,
});
const db = drizzle(client);

const [evt] = await db
  .insert(events)
  .values({ name: "Test BBQ", type: "bbq", startDate: new Date(), location: "Backyard" })
  .returning();
const [s1] = await db
  .insert(students)
  .values({
    firstName: "Alex",
    lastName: "Rivera",
    gender: "F",
    year: "junior",
    igHandle: "alexr",
  })
  .returning();
const [s2] = await db
  .insert(students)
  .values({
    firstName: "Jordan",
    lastName: "Chen",
    gender: "M",
    year: "senior",
  })
  .returning();
await db.insert(attendances).values({ studentId: s1.id, eventId: evt.id, recordedBy: 1 });
await db.insert(attendances).values({ studentId: s2.id, eventId: evt.id, recordedBy: 1 });
console.log("seeded:", { event: evt.id, students: [s1.id, s2.id] });
