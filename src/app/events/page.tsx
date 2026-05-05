import Link from "next/link";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { events, attendances, students } from "../../../drizzle/schema";
import { desc, sql, eq } from "drizzle-orm";
import QuickAdd from "./QuickAdd";
import EventAnalytics from "./EventAnalytics";
import { extractFeatures, aggregate, type FeaturedEvent } from "@/lib/event-features";
import { perEventHealth, topInviters, type StudentLite, type AttendanceLite } from "@/lib/health-metrics";

export const dynamic = "force-dynamic";

export default async function EventsPage() {
  const rows = await db
    .select({
      e: events,
      count: sql<number>`count(${attendances.id})`.as("c"),
    })
    .from(events)
    .leftJoin(attendances, eq(attendances.eventId, events.id))
    .groupBy(events.id)
    .orderBy(desc(events.startDate));

  // Pull all attendances + students once so we can attach health metrics per event.
  const allAttendanceRows = await db
    .select({
      studentId: attendances.studentId,
      eventId: attendances.eventId,
      recordedAt: attendances.recordedAt,
    })
    .from(attendances);
  const studentLiteRows = await db
    .select({
      id: students.id,
      firstName: students.firstName,
      lastName: students.lastName,
      invitedByStudentId: students.invitedByStudentId,
    })
    .from(students);
  const studentsForHealth: StudentLite[] = studentLiteRows.map((s) => ({
    id: s.id,
    firstName: s.firstName,
    lastName: s.lastName,
    invitedByStudentId: s.invitedByStudentId ?? null,
  }));
  const attendancesForHealth: AttendanceLite[] = allAttendanceRows.map((a) => ({
    studentId: a.studentId,
    eventId: a.eventId,
    recordedAt: new Date(a.recordedAt),
  }));

  const featured: FeaturedEvent[] = rows.map(({ e, count }) => {
    const startDate = new Date(e.startDate);
    const health = perEventHealth(
      { id: e.id, startDate },
      attendancesForHealth,
      studentsForHealth
    );
    return {
      id: e.id,
      name: e.name,
      startDate,
      count: Number(count),
      features: extractFeatures({
        name: e.name,
        type: e.type,
        location: e.location,
        notes: e.notes,
        startDate,
      }),
      newAttendees: health.newAttendees,
      invitedNewAttendees: health.invitedNewAttendees,
      inviteRatio: health.inviteRatio,
    };
  });
  const aggregates = aggregate(featured);
  const inviters = topInviters(studentsForHealth, attendancesForHealth);

  const roster = studentLiteRows
    .slice()
    .sort((a, b) => a.firstName.localeCompare(b.firstName))
    .map((r) => ({
      id: r.id,
      name: `${r.firstName}${r.lastName ? " " + r.lastName : ""}`,
    }));

  async function create(formData: FormData) {
    "use server";
    const name = String(formData.get("name") || "").trim();
    const type = String(formData.get("type") || "").trim() || null;
    const raw = String(formData.get("startDate") || "");
    const [y, m, day] = raw.split("-").map(Number);
    const startDate = new Date(y, m - 1, day);
    const location = String(formData.get("location") || "").trim() || null;
    if (!name || isNaN(startDate.getTime())) redirect("/events");
    const [row] = await db
      .insert(events)
      .values({ name, type, startDate, location })
      .returning();
    redirect(`/events/${row.id}`);
  }

  return (
    <div className="max-w-6xl mx-auto px-4 py-8 space-y-8">
      <h1 className="text-2xl font-semibold">Events</h1>

      <QuickAdd roster={roster} />

      <form action={create} className="card grid grid-cols-1 md:grid-cols-5 gap-3 items-end">
        <div className="md:col-span-2">
          <label className="label" htmlFor="name">Event name</label>
          <input id="name" name="name" required className="input" placeholder="Winter Retreat 2026" />
        </div>
        <div>
          <label className="label" htmlFor="type">Type</label>
          <input id="type" name="type" className="input" placeholder="retreat / weekly / bbq" />
        </div>
        <div>
          <label className="label" htmlFor="startDate">Date</label>
          <input id="startDate" name="startDate" type="date" required className="input" defaultValue={new Date().toISOString().slice(0,10)} />
        </div>
        <div>
          <label className="label" htmlFor="location">Location</label>
          <input id="location" name="location" className="input" />
        </div>
        <div className="md:col-span-5 flex justify-end">
          <button type="submit" className="btn-primary">+ Create event</button>
        </div>
      </form>

      {featured.length >= 3 && <EventAnalytics aggregates={aggregates} topInviters={inviters} />}

      <div className="card overflow-x-auto">
        <table>
          <thead>
            <tr>
              <th>Name</th>
              <th>Type</th>
              <th>Date</th>
              <th>Location</th>
              <th>Attendees</th>
            </tr>
          </thead>
          <tbody>
            {rows.map(({ e, count }) => (
              <tr key={e.id} className="hover:bg-black/5 dark:hover:bg-white/5">
                <td>
                  <Link href={`/events/${e.id}`} className="font-medium hover:underline">{e.name}</Link>
                </td>
                <td>{e.type ?? <span className="text-black/30">—</span>}</td>
                <td>{new Date(e.startDate).toLocaleDateString()}</td>
                <td>{e.location ?? <span className="text-black/30">—</span>}</td>
                <td>{Number(count)}</td>
              </tr>
            ))}
            {rows.length === 0 && (
              <tr><td colSpan={5} className="text-center text-black/50 py-8">No events yet. Create one above.</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
