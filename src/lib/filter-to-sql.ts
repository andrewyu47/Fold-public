import { and, eq, inArray, like, sql, or, SQL } from "drizzle-orm";
import { db } from "./db";
import { students, attendances, events } from "../../drizzle/schema";

export type FilterSpec = {
  gender?: "M" | "F";
  year?: string[];
  isActive?: boolean;
  contactedViaIg?: boolean;
  attendedEventNameContains?: string;
  notAttendedSinceDays?: number;
  attendedAtLeast?: number;
  nameContains?: string;
  primaryContactContains?: string;
};

export async function runFilter(spec: FilterSpec) {
  const conds: SQL[] = [];

  if (spec.gender) conds.push(eq(students.gender, spec.gender));
  if (spec.year?.length) conds.push(inArray(students.year, spec.year as any));
  if (typeof spec.isActive === "boolean") conds.push(eq(students.isActive, spec.isActive));
  if (typeof spec.contactedViaIg === "boolean")
    conds.push(eq(students.contactedViaIg, spec.contactedViaIg));

  if (spec.nameContains) {
    const q = `%${spec.nameContains.toLowerCase()}%`;
    conds.push(
      or(
        like(sql`lower(${students.firstName})`, q),
        like(sql`lower(coalesce(${students.lastName}, ''))`, q)
      )!
    );
  }
  if (spec.primaryContactContains) {
    const q = `%${spec.primaryContactContains.toLowerCase()}%`;
    conds.push(like(sql`lower(coalesce(${students.primaryContact}, ''))`, q));
  }

  if (spec.attendedEventNameContains) {
    const needle = `%${spec.attendedEventNameContains.toLowerCase()}%`;
    conds.push(
      sql`${students.id} IN (
        SELECT a.student_id FROM ${attendances} a
        JOIN ${events} e ON e.id = a.event_id
        WHERE lower(e.name) LIKE ${needle}
      )`
    );
  }

  if (typeof spec.attendedAtLeast === "number" && spec.attendedAtLeast > 0) {
    conds.push(
      sql`${students.id} IN (
        SELECT student_id FROM ${attendances}
        GROUP BY student_id HAVING COUNT(*) >= ${spec.attendedAtLeast}
      )`
    );
  }

  if (typeof spec.notAttendedSinceDays === "number" && spec.notAttendedSinceDays > 0) {
    const cutoff = Math.floor(Date.now() / 1000) - spec.notAttendedSinceDays * 86400;
    conds.push(
      sql`NOT EXISTS (
        SELECT 1 FROM ${attendances}
        WHERE student_id = ${students.id} AND recorded_at >= ${cutoff}
      )`
    );
  }

  const where = conds.length ? and(...conds) : undefined;
  return db.select().from(students).where(where).orderBy(students.firstName);
}
