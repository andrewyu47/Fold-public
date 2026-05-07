import Link from "next/link";
import { db } from "@/lib/db";
import { students, attendances, contactAttempts, users, funnelSweepLog } from "../../../drizzle/schema";
import { sql, eq, and, desc } from "drizzle-orm";
import type { FunnelStage } from "@/lib/funnel/types";
import FunnelSweepButton from "../funnel/FunnelSweepButton";

export const dynamic = "force-dynamic";

const STAGE_ORDER: FunnelStage[] = [
  "new", "reaching_out", "connected", "met", "active", "engaged", "inactive",
];
const STAGE_LABEL: Record<FunnelStage, string> = {
  new: "New", reaching_out: "Reaching out", connected: "Connected",
  met: "Met", active: "Active", engaged: "Engaged", inactive: "Inactive",
};
const FUNNEL_FILTERS = [
  { key: "no_attempts", label: "No attempts yet" },
  { key: "stale_response", label: "Connected, no follow-up 7d+" },
  { key: "over_tapped", label: "5+ leaders contacted" },
  { key: "inactive", label: "Inactive" },
] as const;
type FilterKey = (typeof FUNNEL_FILTERS)[number]["key"];

export default async function StudentsPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; tab?: string; stage?: string; filter?: string }>;
}) {
  const sp = await searchParams;
  const q = sp.q?.trim().toLowerCase() ?? "";
  const tab = sp.tab === "cold" ? "cold" : sp.tab === "funnel" ? "funnel" : "all";

  const rows = q
    ? await db
        .select()
        .from(students)
        .where(
          sql`lower(first_name || ' ' || coalesce(last_name, '') || ' ' || coalesce(ig_handle, '')) LIKE ${`%${q}%`}`
        )
        .orderBy(students.firstName)
    : await db.select().from(students).orderBy(students.firstName);

  // Cold list: active students with no attendance in last 30 days
  const cutoff30 = Math.floor((Date.now() - 30 * 86400_000) / 1000);
  const coldRows = await db
    .select()
    .from(students)
    .where(
      and(
        eq(students.isActive, true),
        sql`NOT EXISTS (SELECT 1 FROM attendances WHERE student_id = ${students.id} AND recorded_at >= ${cutoff30})`
      )
    )
    .orderBy(students.firstName);

  // --- Funnel data (only loaded when on funnel tab) ---
  type FunnelStudent = { id: number; firstName: string; lastName: string | null; funnelStage: string; addedByUserId: number | null; firstMetContext: string | null; createdAt: Date };
  let funnelData: {
    allStudents: FunnelStudent[];
    filtered: FunnelStudent[];
    countByStage: Record<string, number>;
    attemptStats: Map<number, { count: number; lastAt: Date | null; lastResponded: boolean; leaderIds: Set<number> }>;
    userById: Map<number, string>;
    recentSweeps: any[];
    activeStage: FunnelStage | null;
    activeFilter: FilterKey | null;
  } | null = null;

  if (tab === "funnel") {
    const activeStage = (STAGE_ORDER as readonly string[]).includes(sp.stage ?? "")
      ? (sp.stage as FunnelStage) : null;
    const activeFilter = (FUNNEL_FILTERS.map((f) => f.key) as readonly string[]).includes(sp.filter ?? "")
      ? (sp.filter as FilterKey) : null;

    const stageCounts = await db
      .select({ stage: students.funnelStage, c: sql<number>`count(*)` })
      .from(students).groupBy(students.funnelStage);
    const countByStage: Record<string, number> = Object.fromEntries(stageCounts.map((r) => [r.stage, r.c]));

    const allAttempts = await db
      .select({ studentId: contactAttempts.studentId, attemptedAt: contactAttempts.attemptedAt, responded: contactAttempts.responded, attemptedByUserId: contactAttempts.attemptedByUserId })
      .from(contactAttempts).orderBy(desc(contactAttempts.attemptedAt));
    const userRows = await db.select({ id: users.id, displayName: users.displayName }).from(users);
    const userById = new Map(userRows.map((u) => [u.id, u.displayName]));

    const attemptStats = new Map<number, { count: number; lastAt: Date | null; lastResponded: boolean; leaderIds: Set<number> }>();
    for (const a of allAttempts) {
      const s = attemptStats.get(a.studentId) ?? { count: 0, lastAt: null, lastResponded: false, leaderIds: new Set<number>() };
      s.count += 1;
      if (!s.lastAt || a.attemptedAt > s.lastAt) { s.lastAt = a.attemptedAt; s.lastResponded = !!a.responded; }
      if (a.attemptedByUserId) s.leaderIds.add(a.attemptedByUserId);
      attemptStats.set(a.studentId, s);
    }

    const allStudents = await db
      .select({ id: students.id, firstName: students.firstName, lastName: students.lastName, funnelStage: students.funnelStage, addedByUserId: students.addedByUserId, firstMetContext: students.firstMetContext, createdAt: students.createdAt })
      .from(students);

    const now = Date.now();
    const sevenDays = 7 * 24 * 60 * 60 * 1000;
    function passesFilter(sid: number, stage: FunnelStage): boolean {
      if (activeFilter === "no_attempts") return !attemptStats.has(sid);
      if (activeFilter === "stale_response") { if (stage !== "connected") return false; const last = attemptStats.get(sid)?.lastAt; return !last || now - last.getTime() > sevenDays; }
      if (activeFilter === "over_tapped") { const s = attemptStats.get(sid); return !!s && s.leaderIds.size >= 5; }
      if (activeFilter === "inactive") return stage === "inactive";
      return true;
    }

    const filtered = allStudents.filter((s) => {
      if (activeStage && s.funnelStage !== activeStage) return false;
      return passesFilter(s.id, s.funnelStage as FunnelStage);
    });
    filtered.sort((a, b) => {
      const aLast = attemptStats.get(a.id)?.lastAt?.getTime() ?? 0;
      const bLast = attemptStats.get(b.id)?.lastAt?.getTime() ?? 0;
      if (aLast !== bLast) return bLast - aLast;
      return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
    });

    const recentSweeps = await db.select().from(funnelSweepLog).orderBy(desc(funnelSweepLog.runAt)).limit(5);

    funnelData = { allStudents, filtered, countByStage, attemptStats, userById, recentSweeps: recentSweeps as any, activeStage, activeFilter };
  }

  const coldWithLast = await Promise.all(
    coldRows.map(async (s) => {
      const last = await db
        .select({ at: sql<number>`max(recorded_at)` })
        .from(attendances)
        .where(eq(attendances.studentId, s.id));
      const ts = Number(last[0]?.at ?? 0);
      return {
        ...s,
        lastSeen: ts ? new Date(ts * 1000).toLocaleDateString("en-US", { timeZone: "UTC" }) : "never",
        lastSeenTs: ts,
      };
    })
  );
  coldWithLast.sort((a, b) => a.lastSeenTs - b.lastSeenTs);

  return (
    <div className="max-w-6xl mx-auto px-4 py-8 space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Students</h1>
        <Link href="/students/new" className="btn-primary">+ New student</Link>
      </div>

      <div className="flex gap-1 border-b border-black/10 dark:border-white/10">
        <Link
          href="/students"
          className={`px-3 py-2 text-sm border-b-2 -mb-px ${tab === "all" ? "border-accent font-medium" : "border-transparent text-black/60 hover:text-black"}`}
        >
          All ({rows.length})
        </Link>
        <Link
          href="/students?tab=cold"
          className={`px-3 py-2 text-sm border-b-2 -mb-px ${tab === "cold" ? "border-accent font-medium" : "border-transparent text-black/60 hover:text-black"}`}
        >
          Gone cold ({coldWithLast.length})
        </Link>
        <Link
          href="/students?tab=funnel"
          className={`px-3 py-2 text-sm border-b-2 -mb-px ${tab === "funnel" ? "border-accent font-medium" : "border-transparent text-black/60 hover:text-black"}`}
        >
          Funnel
        </Link>
      </div>

      {tab === "all" && (
        <>
          <form className="flex gap-2" method="GET">
            <input name="q" defaultValue={q} placeholder="Search name or IG…" className="input" />
            <button className="btn-ghost border border-black/10 dark:border-white/10" type="submit">Search</button>
          </form>

          <div className="card overflow-x-auto">
            <table>
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Year</th>
                  <th>Status</th>
                  <th>IG</th>
                  <th>Active</th>
                  <th>Contact</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((s) => (
                  <tr key={s.id} className="hover:bg-black/5 dark:hover:bg-white/5">
                    <td>
                      <Link href={`/students/${s.id}`} className="font-medium hover:underline">
                        {s.firstName} {s.lastName ?? ""}
                      </Link>
                      <div className="text-xs text-black/50">{s.gender ? (s.gender === "M" ? "♂" : "♀") : ""}</div>
                    </td>
                    <td>{s.year ?? <span className="text-black/30">—</span>}</td>
                    <td>{s.memberStatus ? <span className="chip">{s.memberStatus}</span> : <span className="text-black/30">—</span>}</td>
                    <td>{s.igHandle ? <span className="text-black/70">@{s.igHandle}</span> : <span className="text-black/30">—</span>}</td>
                    <td>{s.isActive ? "✓" : <span className="text-black/30">—</span>}</td>
                    <td className="text-sm">{s.primaryContact ?? <span className="text-black/30">—</span>}</td>
                  </tr>
                ))}
                {rows.length === 0 && (
                  <tr><td colSpan={6} className="text-center text-black/50 py-8">No students yet. Try <Link className="underline" href="/import">/import</Link>.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </>
      )}

      {tab === "cold" && (
        <div className="card">
          <p className="text-sm text-black/60 mb-3">
            Active students who haven't shown up in the last 30 days, sorted oldest-first. Your follow-up queue.
          </p>
          {coldWithLast.length === 0 ? (
            <p className="text-sm text-black/50">Nobody's cold.</p>
          ) : (
            <table>
              <thead>
                <tr><th>Name</th><th>Year</th><th>Status</th><th>Primary contact</th><th>Last seen</th></tr>
              </thead>
              <tbody>
                {coldWithLast.map((s) => (
                  <tr key={s.id} className="hover:bg-black/5 dark:hover:bg-white/5">
                    <td><Link href={`/students/${s.id}`} className="font-medium hover:underline">{s.firstName} {s.lastName ?? ""}</Link></td>
                    <td>{s.year ?? "—"}</td>
                    <td>{s.memberStatus ? <span className="chip">{s.memberStatus}</span> : "—"}</td>
                    <td className="text-sm">{s.primaryContact ?? <span className="text-black/30">—</span>}</td>
                    <td className="text-sm text-black/60">{s.lastSeen}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}

      {tab === "funnel" && funnelData && (() => {
        const { allStudents: fAll, filtered, countByStage, attemptStats, userById, recentSweeps, activeStage, activeFilter } = funnelData;
        const now = Date.now();
        return (
          <>
            <div className="flex items-center justify-between">
              <div className="flex flex-wrap gap-2">
                <Link
                  href="/students?tab=funnel"
                  className={`chip ${!activeStage && !activeFilter ? "bg-accent/20 text-accent" : ""}`}
                >
                  All ({fAll.length})
                </Link>
                {STAGE_ORDER.map((stage) => (
                  <Link
                    key={stage}
                    href={`/students?tab=funnel&stage=${stage}`}
                    className={`chip ${activeStage === stage ? "bg-accent/20 text-accent" : ""}`}
                  >
                    {STAGE_LABEL[stage]} ({countByStage[stage] ?? 0})
                  </Link>
                ))}
              </div>
              <FunnelSweepButton />
            </div>

            <div className="flex flex-wrap gap-2 text-xs">
              <span className="text-black/60 self-center">Quick filters:</span>
              {FUNNEL_FILTERS.map((f) => (
                <Link
                  key={f.key}
                  href={`/students?tab=funnel&filter=${f.key}`}
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
                    <th>Name</th><th>Stage</th><th>First met</th><th>Attempts</th><th>Leaders</th><th>Last touch</th><th></th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((s) => {
                    const stat = attemptStats.get(s.id);
                    const last = stat?.lastAt;
                    const leaders = stat ? Array.from(stat.leaderIds) : [];
                    return (
                      <tr key={s.id}>
                        <td><Link href={`/students/${s.id}`} className="hover:underline">{s.firstName} {s.lastName ?? ""}</Link></td>
                        <td><span className="chip">{STAGE_LABEL[s.funnelStage as FunnelStage]}</span></td>
                        <td className="text-xs text-black/60">{s.firstMetContext ?? "—"}</td>
                        <td>
                          {stat ? (<>{stat.count}{stat.lastResponded && <span className="ml-1 text-emerald-600">✓</span>}</>) : <span className="text-black/40">0</span>}
                        </td>
                        <td className="text-xs text-black/60">
                          {leaders.slice(0, 3).map((id) => userById.get(id) ?? `#${id}`).join(", ")}
                          {leaders.length > 3 ? ` +${leaders.length - 3}` : ""}
                        </td>
                        <td className="text-xs text-black/60">
                          {last ? `${Math.floor((now - last.getTime()) / (24 * 60 * 60 * 1000))}d ago` : "—"}
                        </td>
                        <td className="text-right"><Link href={`/students/${s.id}`} className="text-xs underline">open</Link></td>
                      </tr>
                    );
                  })}
                  {filtered.length === 0 && (
                    <tr><td colSpan={7} className="text-center text-black/50 py-6">No students match this view.</td></tr>
                  )}
                </tbody>
              </table>
            </div>

            {(recentSweeps as any[]).length > 0 && (
              <section className="card space-y-2">
                <h2 className="font-semibold">Recent sweeps</h2>
                <ul className="text-sm divide-y divide-black/5 dark:divide-white/10">
                  {(recentSweeps as any[]).map((s: any) => (
                    <li key={s.id} className="py-2 flex items-baseline justify-between gap-3">
                      <div className="space-y-0.5">
                        <div>
                          <span className="chip mr-2">{s.triggeredBy}</span>
                          Flipped <strong>{s.flippedCount}</strong> to inactive
                          <span className="text-black/50"> (evaluated {s.evaluated}, threshold {s.thresholdDays}d)</span>
                        </div>
                        {s.flippedCount > 0 && s.flipped?.length > 0 && (
                          <div className="text-xs text-black/50">
                            {s.flipped.slice(0, 8).map((f: any, i: number) => (
                              <span key={f.studentId}>
                                {i > 0 ? ", " : ""}
                                <Link href={`/students/${f.studentId}`} className="hover:underline">#{f.studentId}</Link>
                                <span className="text-black/30"> ({f.from})</span>
                              </span>
                            ))}
                            {s.flipped.length > 8 && <span className="text-black/30"> +{s.flipped.length - 8} more</span>}
                          </div>
                        )}
                      </div>
                      <span className="text-xs text-black/50 whitespace-nowrap">{new Date(s.runAt).toLocaleString()}</span>
                    </li>
                  ))}
                </ul>
              </section>
            )}
          </>
        );
      })()}
    </div>
  );
}
