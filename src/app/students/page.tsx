import Link from "next/link";
import { db } from "@/lib/db";
import { students, attendances } from "../../../drizzle/schema";
import { sql, eq, and } from "drizzle-orm";

export const dynamic = "force-dynamic";

export default async function StudentsPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; tab?: string }>;
}) {
  const sp = await searchParams;
  const q = sp.q?.trim().toLowerCase() ?? "";
  const tab = sp.tab === "cold" ? "cold" : "all";

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

  const coldWithLast = await Promise.all(
    coldRows.map(async (s) => {
      const last = await db
        .select({ at: sql<number>`max(recorded_at)` })
        .from(attendances)
        .where(eq(attendances.studentId, s.id));
      const ts = Number(last[0]?.at ?? 0);
      return {
        ...s,
        lastSeen: ts ? new Date(ts * 1000).toLocaleDateString() : "never",
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
                    <td>{s.igHandle ? <span className="text-black/70">@{s.igHandle}</span> : <span className="text-black/30">—</span>}</td>
                    <td>{s.isActive ? "✓" : <span className="text-black/30">—</span>}</td>
                    <td className="text-sm">{s.primaryContact ?? <span className="text-black/30">—</span>}</td>
                  </tr>
                ))}
                {rows.length === 0 && (
                  <tr><td colSpan={5} className="text-center text-black/50 py-8">No students yet. Try <Link className="underline" href="/import">/import</Link>.</td></tr>
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
            <p className="text-sm text-black/50">Nobody's cold. 🎉</p>
          ) : (
            <table>
              <thead>
                <tr><th>Name</th><th>Year</th><th>Primary contact</th><th>Last seen</th></tr>
              </thead>
              <tbody>
                {coldWithLast.map((s) => (
                  <tr key={s.id} className="hover:bg-black/5 dark:hover:bg-white/5">
                    <td><Link href={`/students/${s.id}`} className="font-medium hover:underline">{s.firstName} {s.lastName ?? ""}</Link></td>
                    <td>{s.year ?? "—"}</td>
                    <td className="text-sm">{s.primaryContact ?? <span className="text-black/30">—</span>}</td>
                    <td className="text-sm text-black/60">{s.lastSeen}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}
    </div>
  );
}
