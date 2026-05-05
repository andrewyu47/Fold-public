import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { events, students, attendances } from "../drizzle/schema";

const db = drizzle(new Database("./data/fold.db"));
const [evt] = db
  .insert(events)
  .values({ name: "Test BBQ", type: "bbq", startDate: new Date(), location: "Backyard" })
  .returning()
  .all();
const [s1] = db
  .insert(students)
  .values({
    firstName: "Alex",
    lastName: "Rivera",
    gender: "F",
    year: "junior",
    igHandle: "alexr",
  })
  .returning()
  .all();
const [s2] = db
  .insert(students)
  .values({
    firstName: "Jordan",
    lastName: "Chen",
    gender: "M",
    year: "senior",
  })
  .returning()
  .all();
db.insert(attendances).values({ studentId: s1.id, eventId: evt.id, recordedBy: 1 }).run();
db.insert(attendances).values({ studentId: s2.id, eventId: evt.id, recordedBy: 1 }).run();
console.log("seeded:", { event: evt.id, students: [s1.id, s2.id] });
