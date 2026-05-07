import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { db } from "@/lib/db";
import { students, attendances, events, contactAttempts, users } from "../../../../drizzle/schema";
import { eq, desc, ne, asc } from "drizzle-orm";
import StudentForm from "./StudentForm";
import { parseStudent } from "@/lib/parse-student";
import ContactLog from "./ContactLog";
import DraftOutreach from "./DraftOutreach";
import type { FunnelStage } from "@/lib/funnel/types";
import {
  perStudentHealth,
  type StudentLite,
  type AttendanceLite,
} from "@/lib/health-metrics";

export const dynamic = "force-dynamic";

export default async function StudentPage({ params }: { params: Promise<{ id: string }> }) {
  const { id: idStr } = await params;
  const id = Number(idStr);
  if (!Number.isFinite(id)) notFound();
  const [s] = await db.select().from(students).where(eq(students.id, id)).limit(1);
  if (!s) notFound();

  const history = await db
    .select({ a: attendances, e: events })
    .from(attendances)
    .innerJoin(events, eq(events.id, attendances.eventId))
    .where(eq(attendances.studentId, id))
    .orderBy(desc(attendances.recordedAt));

  const attemptRows = await db
    .select({
      id: contactAttempts.id,
      channel: contactAttempts.channel,
      channelDetail: contactAttempts.channelDetail,
      attemptedAt: contactAttempts.attemptedAt,
      responded: contactAttempts.responded,
      notes: contactAttempts.notes,
      byName: users.displayName,
    })
    .from(contactAttempts)
    .leftJoin(users, eq(users.id, contactAttempts.attemptedByUserId))
    .where(eq(contactAttempts.studentId, id))
    .orderBy(desc(contactAttempts.attemptedAt));

  const attempts = attemptRows.map((a) => ({
    id: a.id,
    channel: a.channel,
    channelDetail: a.channelDetail,
    attemptedAt: a.attemptedAt.toISOString(),
    responded: a.responded,
    notes: a.notes,
    attemptedByDisplayName: a.byName ?? undefined,
  }));

  const rosterRows = await db
    .select({
      id: students.id,
      firstName: students.firstName,
      lastName: students.lastName,
      invitedByStudentId: students.invitedByStudentId,
    })
    .from(students)
    .orderBy(asc(students.firstName));
  const roster = rosterRows
    .filter((r) => r.id !== id)
    .map((r) => ({
      id: r.id,
      name: `${r.firstName}${r.lastName ? " " + r.lastName : ""}`,
    }));

  const studentsForHealth: StudentLite[] = rosterRows.map((r) => ({
    id: r.id,
    firstName: r.firstName,
    lastName: r.lastName,
    invitedByStudentId: r.invitedByStudentId ?? null,
  }));
  const allAttendanceRows = await db
    .select({
      studentId: attendances.studentId,
      eventId: attendances.eventId,
      recordedAt: attendances.recordedAt,
    })
    .from(attendances);
  const attendancesForHealth: AttendanceLite[] = allAttendanceRows.map((a) => ({
    studentId: a.studentId,
    eventId: a.eventId,
    recordedAt: new Date(a.recordedAt),
  }));
  const healthMap = perStudentHealth(studentsForHealth, attendancesForHealth);
  const myHealth = healthMap.get(id) ?? null;
  const inviter = s.invitedByStudentId
    ? rosterRows.find((r) => r.id === s.invitedByStudentId)
    : null;
  const friends = (myHealth?.friendIds ?? [])
    .map((fid) => rosterRows.find((r) => r.id === fid))
    .filter((r): r is (typeof rosterRows)[number] => !!r);

  async function update(formData: FormData) {
    "use server";
    const data = parseStudent(formData);
    await db.update(students).set({ ...data, updatedAt: new Date() }).where(eq(students.id, id));
    redirect(`/students/${id}`);
  }

  async function del() {
    "use server";
    await db.delete(students).where(eq(students.id, id));
    redirect("/students");
  }

  return (
    <div className="max-w-3xl mx-auto px-4 py-8 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <Link href="/students" className="text-sm text-black/60 hover:underline">← Students</Link>
          <h1 className="text-2xl font-semibold">
            {s.firstName} {s.lastName ?? ""}
          </h1>
        </div>
        <form action={del}>
          <button className="btn-ghost text-red-600" type="submit">Delete</button>
        </form>
      </div>

      <StudentForm action={update} student={s} roster={roster} />

      {myHealth && (
        <section className="card space-y-2 border-accent/20">
          <div className="flex items-baseline justify-between">
            <h2 className="font-semibold">🪜 Health</h2>
            <span className="chip">{myHealth.inviterTier}</span>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-sm">
            <div className="rounded-lg border border-black/10 dark:border-white/10 p-2">
              <div className="text-[10px] uppercase tracking-wide text-black/50">Friends brought</div>
              <div className="text-2xl font-semibold tabular-nums">{myHealth.friendsBrought}</div>
            </div>
            <div className="rounded-lg border border-black/10 dark:border-white/10 p-2">
              <div className="text-[10px] uppercase tracking-wide text-black/50">Last 30d</div>
              <div className="text-2xl font-semibold tabular-nums">{myHealth.recentAttendance}</div>
            </div>
            <div className="rounded-lg border border-black/10 dark:border-white/10 p-2">
              <div className="text-[10px] uppercase tracking-wide text-black/50">Last 365d</div>
              <div className="text-2xl font-semibold tabular-nums">{myHealth.yearlyAttendance}</div>
            </div>
            <div className="rounded-lg border border-black/10 dark:border-white/10 p-2">
              <div className="text-[10px] uppercase tracking-wide text-black/50">Lifetime</div>
              <div className="text-2xl font-semibold tabular-nums">{myHealth.totalAttendance}</div>
            </div>
          </div>
          {inviter && (
            <p className="text-sm">
              <span className="text-black/60">Invited by:</span>{" "}
              <Link href={`/students/${inviter.id}`} className="hover:underline">
                {inviter.firstName}
                {inviter.lastName ? " " + inviter.lastName : ""}
              </Link>
            </p>
          )}
          {friends.length > 0 && (
            <div className="text-sm">
              <div className="text-black/60 mb-1">Brought ({friends.length}):</div>
              <ul className="flex flex-wrap gap-2">
                {friends.map((f) => (
                  <li key={f.id}>
                    <Link href={`/students/${f.id}`} className="chip hover:bg-black/10">
                      {f.firstName}
                      {f.lastName ? " " + f.lastName : ""}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </section>
      )}

      <DraftOutreach studentId={s.id} />

      <ContactLog
        studentId={s.id}
        attempts={attempts}
        currentStage={s.funnelStage as FunnelStage}
      />

      <div className="card">
        <h2 className="font-semibold mb-2">Attendance history ({history.length})</h2>
        {history.length === 0 ? (
          <p className="text-sm text-black/50">No events yet.</p>
        ) : (
          <ul className="space-y-1 text-sm">
            {history.map(({ a, e }) => (
              <li key={a.id} className="flex justify-between">
                <Link href={`/events/${e.id}`} className="hover:underline">{e.name}</Link>
                <span className="text-black/50">{new Date(e.startDate).toLocaleDateString("en-US", { timeZone: "UTC" })}</span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
