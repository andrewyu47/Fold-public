import Link from "next/link";
import { db } from "@/lib/db";
import { students, events, attendances } from "../../drizzle/schema";
import { sql, eq, and, gte, isNotNull, inArray, or, isNull } from "drizzle-orm";
import DashboardCharts from "./DashboardCharts";
import QuickAdd from "./events/QuickAdd";

export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  // 1. Attendance over time
  const overTime = await db
    .select({
      eventId: events.id,
      name: events.name,
      date: events.startDate,
      count: sql<number>`count(${attendances.id})`.as("c"),
    })
    .from(events)
    .leftJoin(attendances, eq(attendances.eventId, events.id))
    .groupBy(events.id)
    .orderBy(events.startDate);
  const overTimeData = overTime.map((r) => ({
    name: r.name,
    date: new Date(r.date).toLocaleDateString("en-US", { timeZone: "UTC" }),
    count: Number(r.count),
    eventId: r.eventId,
  }));

  // 2. Funnel
  const totalStudents = await db.select({ c: sql<number>`count(*)` }).from(students);
  const cutoff60 = new Date(Date.now() - 60 * 86400_000);
  const repeatRows = await db
    .select({ sid: attendances.studentId, c: sql<number>`count(*)`.as("c") })
    .from(attendances)
    .groupBy(attendances.studentId);
  const repeatSet = new Set(repeatRows.filter((r) => Number(r.c) >= 2).map((r) => r.sid));
  const recentRows = await db
    .select({ sid: attendances.studentId, c: sql<number>`count(*)`.as("c") })
    .from(attendances)
    .innerJoin(events, eq(attendances.eventId, events.id))
    .where(gte(events.startDate, cutoff60))
    .groupBy(attendances.studentId);
  const activeSet = new Set(recentRows.filter((r) => Number(r.c) >= 3).map((r) => r.sid));
  const coreMembers = await db
    .select({ c: sql<number>`count(*)` })
    .from(students)
    .where(eq(students.memberStatus, "core"));

  const funnelData = [
    { stage: "All visitors", count: Number(totalStudents[0]?.c ?? 0) },
    { stage: "Repeat (2+)", count: repeatSet.size },
    { stage: "Active (3+ in 60d)", count: activeSet.size },
    { stage: "Core members", count: Number(coreMembers[0]?.c ?? 0) },
  ];

  // 3. Breakdowns
  const byYear = await db
    .select({ year: students.year, c: sql<number>`count(*)`.as("c") })
    .from(students)
    .where(isNotNull(students.year))
    .groupBy(students.year);
  const byGender = await db
    .select({ gender: students.gender, c: sql<number>`count(*)`.as("c") })
    .from(students)
    .where(isNotNull(students.gender))
    .groupBy(students.gender);
  const byType = await db
    .select({ type: events.type, c: sql<number>`count(*)`.as("c") })
    .from(events)
    .where(isNotNull(events.type))
    .groupBy(events.type);

  const breakdowns = {
    year: byYear.map((r) => ({ name: r.year ?? "—", value: Number(r.c) })),
    gender: byGender.map((r) => ({ name: r.gender === "M" ? "Male" : r.gender === "F" ? "Female" : "—", value: Number(r.c) })),
    eventType: byType.map((r) => ({ name: r.type ?? "—", value: Number(r.c) })),
  };

  // 4. 30-day snapshot
  const cutoff30 = new Date(Date.now() - 30 * 86400_000);
  const eventsLast30 = await db
    .select({ c: sql<number>`count(*)` })
    .from(events)
    .where(gte(events.startDate, cutoff30));
  const attendsLast30 = await db
    .select({ c: sql<number>`count(*)` })
    .from(attendances)
    .innerJoin(events, eq(attendances.eventId, events.id))
    .where(gte(events.startDate, cutoff30));
  const newStudentsLast30 = await db
    .select({ c: sql<number>`count(*)` })
    .from(students)
    .where(gte(students.createdAt, cutoff30));
  const uniqueAttendees30 = await db
    .select({ c: sql<number>`count(distinct ${attendances.studentId})` })
    .from(attendances)
    .innerJoin(events, eq(attendances.eventId, events.id))
    .where(gte(events.startDate, cutoff30));

  const snapshot = {
    events: Number(eventsLast30[0]?.c ?? 0),
    attendances: Number(attendsLast30[0]?.c ?? 0),
    uniquePeople: Number(uniqueAttendees30[0]?.c ?? 0),
    newStudents: Number(newStudentsLast30[0]?.c ?? 0),
  };

  // 5. Hot prospects: non-core students sorted by 60-day attendance.
  const hotRows = await db
    .select({
      sid: attendances.studentId,
      visits: sql<number>`count(*)`.as("v"),
      lastSeen: sql<number>`max(${events.startDate})`.as("ls"),
    })
    .from(attendances)
    .innerJoin(events, eq(attendances.eventId, events.id))
    .where(gte(events.startDate, cutoff60))
    .groupBy(attendances.studentId);
  const sortedHot = hotRows
    .map((r) => ({ sid: r.sid, visits: Number(r.visits), lastSeen: Number(r.lastSeen) }))
    .sort((a, b) => b.visits - a.visits);
  const hotIds = sortedHot.map((r) => r.sid);
  const hotStudents = hotIds.length
    ? await db
        .select()
        .from(students)
        .where(
          and(
            inArray(students.id, hotIds),
            or(eq(students.memberStatus, "prospect"), eq(students.memberStatus, "member"), isNull(students.memberStatus))
          )
        )
    : [];
  const hotById = new Map(hotStudents.map((s) => [s.id, s]));
  const hotProspects = sortedHot
    .filter((r) => hotById.has(r.sid))
    .slice(0, 10)
    .map((r) => {
      const s = hotById.get(r.sid)!;
      return {
        id: s.id,
        name: `${s.firstName} ${s.lastName ?? ""}`.trim(),
        year: s.year,
        gender: s.gender,
        status: s.memberStatus,
        primaryContact: s.primaryContact,
        visits: r.visits,
        lastSeen: new Date(r.lastSeen * 1000).toLocaleDateString("en-US", { timeZone: "UTC" }),
      };
    });

  return (
    <div className="max-w-6xl mx-auto px-4 py-8 space-y-8">
      <div>
        <h1 className="text-2xl font-semibold">Dashboard</h1>
      </div>

      <QuickAdd />

      <section className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Stat label="Events (30d)" value={snapshot.events} />
        <Stat label="Total check-ins (30d)" value={snapshot.attendances} />
        <Stat label="Unique people (30d)" value={snapshot.uniquePeople} />
        <Stat label="New students (30d)" value={snapshot.newStudents} />
      </section>

      <DashboardCharts overTime={overTimeData} funnel={funnelData} breakdowns={breakdowns} />

      <section className="card overflow-x-auto">
        <div className="flex items-center justify-between mb-3">
          <div>
            <h2 className="font-semibold">Active prospects</h2>
            <p className="text-xs text-black/60">
              Non-core members ranked by attendance in the last 60 days. Highest priority for follow-up.
            </p>
          </div>
          <Link href="/students" className="text-xs text-black/60 hover:underline">all students →</Link>
        </div>
        {hotProspects.length === 0 ? (
          <p className="text-sm text-black/50">No recent attendance yet.</p>
        ) : (
          <table>
            <thead>
              <tr>
                <th>Name</th><th>Year</th><th>Status</th><th>Visits (60d)</th><th>Primary contact</th><th>Last seen</th>
              </tr>
            </thead>
            <tbody>
              {hotProspects.map((s) => (
                <tr key={s.id} className="hover:bg-black/5 dark:hover:bg-white/5">
                  <td>
                    <Link href={`/students/${s.id}`} className="font-medium hover:underline">{s.name}</Link>
                    <span className="ml-1 text-xs text-black/40">{s.gender === "M" ? "♂" : s.gender === "F" ? "♀" : ""}</span>
                  </td>
                  <td>{s.year ?? "—"}</td>
                  <td>{s.status ? <span className="chip">{s.status}</span> : <span className="text-black/30">—</span>}</td>
                  <td className="font-medium">{s.visits}</td>
                  <td className="text-sm">{s.primaryContact ?? <span className="text-black/30">—</span>}</td>
                  <td className="text-sm text-black/60">{s.lastSeen}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="card">
      <div className="label">{label}</div>
      <div className="text-3xl font-semibold tabular-nums mt-1">{value}</div>
    </div>
  );
}
