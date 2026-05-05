import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { students, events, attendances } from "../../../../drizzle/schema";
import { getCurrentUser } from "@/lib/auth";

type Attendee = {
  match: "existing" | "new";
  studentId?: number;
  firstName?: string;
  lastName?: string;
  gender?: "M" | "F";
  year?: string;
  igHandle?: string;
  invitedById?: number;
  notes?: string;
};

interface SingleBody {
  mode?: "single";
  event?: { name?: string; date?: string; type?: string; location?: string };
  attendees?: Attendee[];
}

interface BatchBody {
  mode: "batch";
  events?: Array<{ name?: string; date?: string; type?: string; location?: string }>;
}

type Body = SingleBody | BatchBody;

export async function POST(req: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const body = (await req.json()) as Body;

  if (body.mode === "batch") {
    const list = Array.isArray(body.events) ? body.events : [];
    if (list.length === 0) {
      return NextResponse.json({ error: "no events provided" }, { status: 400 });
    }
    const created: Array<{ id: number; name: string; date: string }> = [];
    for (const ev of list) {
      if (!ev.name?.trim() || !ev.date) continue;
      const [y, m, day] = ev.date.split("-").map(Number);
      const d = new Date(y, m - 1, day);
      if (isNaN(d.getTime())) continue;
      const [row] = await db
        .insert(events)
        .values({
          name: ev.name.trim(),
          type: ev.type?.trim() || null,
          startDate: d,
          location: ev.location?.trim() || null,
        })
        .returning();
      created.push({ id: row.id, name: row.name, date: row.startDate.toISOString().slice(0, 10) });
    }
    return NextResponse.json({ ok: true, mode: "batch", created });
  }

  // Single-event branch (existing behavior).
  const ev = body.event ?? {};
  if (!ev.name?.trim() || !ev.date) {
    return NextResponse.json({ error: "event.name and event.date required" }, { status: 400 });
  }
  const [y, m, day] = ev.date!.split("-").map(Number);
  const startDate = new Date(y, m - 1, day);
  if (isNaN(startDate.getTime())) {
    return NextResponse.json({ error: "invalid date" }, { status: 400 });
  }
  const list = Array.isArray(body.attendees) ? body.attendees : [];

  const [evt] = await db
    .insert(events)
    .values({
      name: ev.name.trim(),
      type: ev.type?.trim() || null,
      startDate,
      location: ev.location?.trim() || null,
    })
    .returning();

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
          year: (a.year as never) ?? null,
          igHandle: a.igHandle ?? null,
          invitedByStudentId: typeof a.invitedById === "number" ? a.invitedById : null,
          notes: a.notes ?? null,
        })
        .returning();
      sid = row.id;
      created += 1;
    }
    if (!sid) continue;
    try {
      await db.insert(attendances).values({ studentId: sid, eventId: evt.id, recordedBy: user.id }).run();
      marked += 1;
    } catch {
      // ignore unique violation
    }
  }

  return NextResponse.json({ ok: true, mode: "single", eventId: evt.id, created, marked });
}
