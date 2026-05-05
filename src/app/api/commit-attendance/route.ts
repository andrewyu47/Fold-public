import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { students, attendances } from "../../../../drizzle/schema";
import { getCurrentUser } from "@/lib/auth";

type In = {
  match: "existing" | "new";
  studentId?: number;
  firstName?: string;
  lastName?: string;
  gender?: "M" | "F";
  year?: string;
  igHandle?: string;
  notes?: string;
  rawText?: string;
};

export async function POST(req: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const body = (await req.json()) as { eventId?: number; attendees?: In[] };
  const eventId = Number(body.eventId);
  const list = Array.isArray(body.attendees) ? body.attendees : [];
  if (!Number.isFinite(eventId)) {
    return NextResponse.json({ error: "missing eventId" }, { status: 400 });
  }

  let created = 0;
  let marked = 0;

  for (const a of list) {
    let sid: number | undefined;
    if (a.match === "existing" && typeof a.studentId === "number") {
      sid = a.studentId;
    } else if (a.match === "new" && a.firstName) {
      const [row] = await db
        .insert(students)
        .values({
          firstName: a.firstName,
          lastName: a.lastName ?? null,
          gender: a.gender ?? null,
          year: (a.year as any) ?? null,
          igHandle: a.igHandle ?? null,
          notes: a.notes ?? null,
        })
        .returning();
      sid = row.id;
      created += 1;
    }
    if (!sid) continue;
    try {
      await db
        .insert(attendances)
        .values({ studentId: sid, eventId, recordedBy: user.id })
        .run();
      marked += 1;
    } catch {
      // unique violation = already present, ignore
    }
  }

  return NextResponse.json({ ok: true, created, marked });
}
