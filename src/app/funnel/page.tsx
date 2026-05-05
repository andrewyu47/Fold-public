import Link from "next/link";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { students, contactAttempts, attendances, users, funnelSweepLog } from "../../../drizzle/schema";
import { sql, desc, eq } from "drizzle-orm";
import { getCurrentUser } from "@/lib/auth";
import type { FunnelStage } from "@/lib/funnel/types";
import FunnelSweepButton from "./FunnelSweepButton";

export const dynamic = "force-dynamic";

const STAGE_ORDER: FunnelStage[] = [
  "new",
  "reaching_out",
  "connected",
  "met",
  "active",
  "engaged",
  "inactive",
];

const STAGE_LABEL: Record<FunnelStage, string> = {
  new: "New",
  reaching_out: "Reaching out",
  connected: "Connected",
  met: "Met",
  active: "Active",
  engaged: "Engaged",
  inactive: "Inactive",
};

const FILTERS = [
  { key: "no_attempts", label: "No attempts yet" },
  { key: "stale_response", label: "Connected, no follow-up 7d+" },
  { key: "over_tapped", label: "≥5 people contacted" },
  { key: "inactive", label: "Inactive" },
] as const;

type FilterKey = (typeof FILTERS)[number]["key"];

export default async function FunnelPage({
  searchParams,
}: {
  searchParams: Promise<{ stage?: string; filter?: string }>;
}) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  const sp = await searchParams;
  const activeStage = (STAGE_ORDER as readonly string[]).includes(sp.stage ?? "")
    ? (sp.stage as FunnelStage)
    : null;
  const activeFilter = (FILTERS.map((f) => f.key) as readonly string[]).includes(sp.filter ?? "")
    ? (sp.filter as FilterKey)
    : null;

  // Stage counts
  const stageCounts = await db
    .select({ stage: students.funnelStage, c: sql<number>`count(*)` })
    .from(students)
    .groupBy(students.funnelStage);
  const countByStage: Record<string, number> = Object.fromEntries(
    stageCounts.map((r) => [r.stage, r.c])
  );

  // Per-student stats
  const allAttempts = await db
    .select({
      studentId: contactAttempts.studentId,
      attemptedAt: contactAttempts.attemptedAt,
      responded: contactAttempts.responded,
      attemptedByUserId: contactAttempts.attemptedByUserId,
    })
    .from(contactAttempts)
    .orderBy(desc(contactAttempts.attemptedAt));

  const allAttendances = await db
    .select({ studentId: attendances.studentId, recordedAt: attendances.recordedAt })
    .from(attendances)
    .orderBy(desc(attendances.recordedAt));

  const userRows = await db.select({ id: users.id, displayName: users.displayName }).from(users);
  const userById = new Map(userRows.map((u) => [u.id, u.displayName]));

  // Aggregate per student
  const attemptStats = new Map<
    number,
    { count: number; lastAt: Date | null; lastResponded: boolean; leaderIds: Set<number> }
  >();
  for (const a of allAttempts) {
    const s =
      attemptStats.get(a.studentId) ?? {
        count: 0,
        lastAt: null,
        lastResponded: false,
        leaderIds: new Set<number>(),
      };
    s.count += 1;
    if (!s.lastAt || a.attemptedAt > s.lastAt) {
      s.lastAt = a.attemptedAt;
      s.lastResponded = !!a.responded;
    }
    if (a.attemptedByUserId) s.leaderIds.add(a.attemptedByUserId);
    attemptStats.set(a.studentId, s);
  }
  const lastAttended = new Map<number, Date>();
  for (const r of allAttendances) {
    if (!lastAttended.has(r.studentId)) lastAttended.set(r.studentId, r.recordedAt);
  }

  // Pull students for the selected stage / filter
  const allStudents = await db
    .select({
      id: students.id,
      firstName: students.firstName,
      lastName: students.lastName,
      funnelStage: students.funnelStage,
      addedByUserId: students.addedByUserId,
      firstMetContext: students.firstMetContext,
      createdAt: students.createdAt,
    })
    .from(students);

  const now = Date.now();
  const sevenDays = 7 * 24 * 60 * 60 * 1000;

  function passesFilter(sid: number, stage: FunnelStage): boolean {
    if (activeFilter === "no_attempts") return !attemptStats.has(sid);
    if (activeFilter === "stale_response") {
      if (stage !== "connected") return false;
      const last = attemptStats.get(sid)?.lastAt;
      return !last || now - last.getTime() > sevenDays;
    }
    if (activeFilter === "over_tapped") {
      const s = attemptStats.get(sid);
      return !!s && s.leaderIds.size >= 5;
    }
    if (activeFilter === "inactive") return stage === "inactive";
    return true;
  }

  const filtered = allStudents.filter((s) => {
    if (activeStage && s.funnelStage !== activeStage) return false;
    return passesFilter(s.id, s.funnelStage as FunnelStage);
  });

  // Sort: most recent touch first, then created desc
  filtered.sort((a, b) => {
    const aLast = attemptStats.get(a.id)?.lastAt?.getTime() ?? 0;
    const bLast = attemptStats.get(b.id)?.lastAt?.getTime() ?? 0;
    if (aLast !== bLast) return bLast - aLast;
    return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
  });

  const recentSweeps = await db
    .select()
    .from(funnelSweepLog)
    .orderBy(desc(funnelSweepLog.runAt))
    .limit(5);

  return (
    <div className="max-w-6xl mx-auto px-4 py-8 space-y-6">
      <div className="flex items-baseline justify-between">
        <h1 className="text-2xl font-semibold tracking-tight">Funnel</h1>
        <FunnelSweepButton />
      </div>

      <div className="flex flex-wrap gap-2">
        <Link
          href="/funnel"
          className={`chip ${!activeStage && !activeFilter ? "bg-accent/20 text-accent" : ""}`}
        >
          All ({allStudents.length})
        </Link>
        {STAGE_ORDER.map((stage) => (
          <Link
            key={stage}
            href={`/funnel?stage=${stage}`}
            className={`chip ${activeStage === stage ? "bg-accent/20 text-accent" : ""}`}
          >
            {STAGE_LABEL[stage]} ({countByStage[stage] ?? 0})
          </Link>
        ))}
      </div>

      <div className="flex flex-wrap gap-2 text-xs">
        <span className="text-black/60 self-center">Quick filters:</span>
        {FILTERS.map((f) => (
          <Link
            key={f.key}
            href={`/funnel?filter=${f.key}`}
            className={`chip ${activeFilter === f.key ? "bg-accent/20 text-accent" : ""}`}
          >
            {f.label}
          </Link>
        ))}
      </div>

      <div className="card overflow-x-auto">
        <table>
          <thead>
            <tr>
              <th>Name</th>
              <th>Stage</th>
              <th>First met</th>
              <th>Attempts</th>
              <th>Leaders</th>
              <th>Last touch</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((s) => {
              const stat = attemptStats.get(s.id);
              const last = stat?.lastAt;
              const leaders = stat ? Array.from(stat.leaderIds) : [];
              return (
                <tr key={s.id}>
                  <td>
                    <Link href={`/students/${s.id}`} className="hover:underline">
                      {s.firstName} {s.lastName ?? ""}
                    </Link>
                  </td>
                  <td>
                    <span className="chip">{STAGE_LABEL[s.funnelStage as FunnelStage]}</span>
                  </td>
                  <td className="text-xs text-black/60">{s.firstMetContext ?? "—"}</td>
                  <td>
                    {stat ? (
                      <>
                        {stat.count}
                        {stat.lastResponded && (
                          <span className="ml-1 text-emerald-600">✓</span>
                        )}
                      </>
                    ) : (
                      <span className="text-black/40">0</span>
                    )}
                  </td>
                  <td className="text-xs text-black/60">
                    {leaders
                      .slice(0, 3)
                      .map((id) => userById.get(id) ?? `#${id}`)
                      .join(", ")}
                    {leaders.length > 3 ? ` +${leaders.length - 3}` : ""}
                  </td>
                  <td className="text-xs text-black/60">
                    {last
                      ? `${Math.floor((now - last.getTime()) / (24 * 60 * 60 * 1000))}d ago`
                      : "—"}
                  </td>
                  <td className="text-right">
                    <Link href={`/students/${s.id}`} className="text-xs underline">
                      open
                    </Link>
                  </td>
                </tr>
              );
            })}
            {filtered.length === 0 && (
              <tr>
                <td colSpan={7} className="text-center text-black/50 py-6">
                  No students match this view.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {recentSweeps.length > 0 && (
        <section className="card space-y-2">
          <h2 className="font-semibold">Recent sweeps</h2>
          <ul className="text-sm divide-y divide-black/5 dark:divide-white/10">
            {recentSweeps.map((s) => (
              <li key={s.id} className="py-2 flex items-baseline justify-between gap-3">
                <div className="space-y-0.5">
                  <div>
                    <span className="chip mr-2">{s.triggeredBy}</span>
                    Flipped <strong>{s.flippedCount}</strong> → inactive
                    <span className="text-black/50">
                      {" "}
                      (evaluated {s.evaluated}, threshold {s.thresholdDays}d)
                    </span>
                  </div>
                  {s.flippedCount > 0 && s.flipped && s.flipped.length > 0 && (
                    <div className="text-xs text-black/50">
                      {s.flipped.slice(0, 8).map((f, i) => (
                        <span key={f.studentId}>
                          {i > 0 ? ", " : ""}
                          <Link href={`/students/${f.studentId}`} className="hover:underline">
                            #{f.studentId}
                          </Link>
                          <span className="text-black/30"> ({f.from})</span>
                        </span>
                      ))}
                      {s.flipped.length > 8 && (
                        <span className="text-black/30"> …+{s.flipped.length - 8} more</span>
                      )}
                    </div>
                  )}
                </div>
                <span className="text-xs text-black/50 whitespace-nowrap">
                  {new Date(s.runAt).toLocaleString()}
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
