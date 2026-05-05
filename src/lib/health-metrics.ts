// Pure functions over students + attendances. No DB, no I/O — composable from any caller.

export type StudentLite = {
  id: number;
  firstName: string;
  lastName: string | null;
  invitedByStudentId: number | null;
};

export type AttendanceLite = {
  studentId: number;
  eventId: number;
  recordedAt: Date;
};

export type EventLite = {
  id: number;
  startDate: Date;
};

export type InviterTier = "none" | "occasional" | "connector";

export interface PerStudentHealth {
  studentId: number;
  friendsBrought: number;
  friendIds: number[];
  lastInviteAt: Date | null;
  inviterTier: InviterTier;
  /** events attended in the last 30d */
  recentAttendance: number;
  /** events attended in the last 365d */
  yearlyAttendance: number;
  /** lifetime attendance count */
  totalAttendance: number;
}

export interface PerEventHealth {
  eventId: number;
  newAttendees: number;
  invitedNewAttendees: number;
  inviteRatio: number; // 0..1, 0 if newAttendees == 0
}

const DAY = 24 * 60 * 60 * 1000;

export function perStudentHealth(
  students: StudentLite[],
  attendances: AttendanceLite[],
  now: Date = new Date()
): Map<number, PerStudentHealth> {
  // Index: who did each student bring?
  const friendsByInviter = new Map<number, StudentLite[]>();
  for (const s of students) {
    if (s.invitedByStudentId == null) continue;
    const arr = friendsByInviter.get(s.invitedByStudentId) ?? [];
    arr.push(s);
    friendsByInviter.set(s.invitedByStudentId, arr);
  }

  // Index: most-recent attendance per student
  const attendanceCountByStudent = new Map<number, number[]>(); // ms timestamps
  for (const a of attendances) {
    const arr = attendanceCountByStudent.get(a.studentId) ?? [];
    arr.push(a.recordedAt.getTime());
    attendanceCountByStudent.set(a.studentId, arr);
  }
  // Per-friend earliest attendance to compute "lastInviteAt" (when an inviter
  // drove someone's first attendance).
  const earliestAttendance = new Map<number, number>();
  for (const a of attendances) {
    const t = a.recordedAt.getTime();
    const prev = earliestAttendance.get(a.studentId);
    if (prev == null || t < prev) earliestAttendance.set(a.studentId, t);
  }

  const out = new Map<number, PerStudentHealth>();
  for (const s of students) {
    const friends = friendsByInviter.get(s.id) ?? [];
    const friendIds = friends.map((f) => f.id);
    let lastInviteAt: number | null = null;
    for (const f of friends) {
      const e = earliestAttendance.get(f.id);
      if (e != null && (lastInviteAt == null || e > lastInviteAt)) lastInviteAt = e;
    }
    const tier: InviterTier =
      friends.length >= 3 ? "connector" : friends.length >= 1 ? "occasional" : "none";

    const ts = attendanceCountByStudent.get(s.id) ?? [];
    const cutoff30 = now.getTime() - 30 * DAY;
    const cutoff365 = now.getTime() - 365 * DAY;
    const recent = ts.filter((t) => t >= cutoff30).length;
    const yearly = ts.filter((t) => t >= cutoff365).length;

    out.set(s.id, {
      studentId: s.id,
      friendsBrought: friends.length,
      friendIds,
      lastInviteAt: lastInviteAt == null ? null : new Date(lastInviteAt),
      inviterTier: tier,
      recentAttendance: recent,
      yearlyAttendance: yearly,
      totalAttendance: ts.length,
    });
  }
  return out;
}

export function perEventHealth(
  event: EventLite,
  attendances: AttendanceLite[],
  students: StudentLite[]
): PerEventHealth {
  const studentsById = new Map(students.map((s) => [s.id, s]));
  // Earliest attendance per student
  const earliestAttendance = new Map<number, { eventId: number; t: number }>();
  for (const a of attendances) {
    const prev = earliestAttendance.get(a.studentId);
    const t = a.recordedAt.getTime();
    if (prev == null || t < prev.t) earliestAttendance.set(a.studentId, { eventId: a.eventId, t });
  }

  // New attendees = students whose first-ever attendance is THIS event.
  let newAttendees = 0;
  let invitedNewAttendees = 0;
  for (const [studentId, first] of earliestAttendance) {
    if (first.eventId !== event.id) continue;
    newAttendees++;
    const s = studentsById.get(studentId);
    if (s?.invitedByStudentId != null) invitedNewAttendees++;
  }

  return {
    eventId: event.id,
    newAttendees,
    invitedNewAttendees,
    inviteRatio: newAttendees === 0 ? 0 : invitedNewAttendees / newAttendees,
  };
}

export interface TopInviter {
  studentId: number;
  name: string;
  count: number;
  tier: InviterTier;
}

export function topInviters(
  students: StudentLite[],
  attendances: AttendanceLite[],
  now: Date = new Date(),
  windowDays = 90,
  limit = 5
): TopInviter[] {
  const cutoff = now.getTime() - windowDays * DAY;
  // Within window: a student counts as "brought" if their FIRST attendance is in the window.
  const earliestAttendance = new Map<number, number>();
  for (const a of attendances) {
    const t = a.recordedAt.getTime();
    const prev = earliestAttendance.get(a.studentId);
    if (prev == null || t < prev) earliestAttendance.set(a.studentId, t);
  }
  const broughtCounts = new Map<number, number>();
  for (const s of students) {
    if (s.invitedByStudentId == null) continue;
    const earliest = earliestAttendance.get(s.id);
    if (earliest != null && earliest >= cutoff) {
      broughtCounts.set(
        s.invitedByStudentId,
        (broughtCounts.get(s.invitedByStudentId) ?? 0) + 1
      );
    }
  }
  const studentsById = new Map(students.map((s) => [s.id, s]));
  const ranked: TopInviter[] = Array.from(broughtCounts.entries())
    .map(([studentId, count]) => {
      const s = studentsById.get(studentId);
      const name = s ? `${s.firstName}${s.lastName ? " " + s.lastName : ""}` : `#${studentId}`;
      const tier: InviterTier = count >= 3 ? "connector" : count >= 1 ? "occasional" : "none";
      return { studentId, name, count, tier };
    })
    .sort((a, b) => b.count - a.count)
    .slice(0, limit);
  return ranked;
}
