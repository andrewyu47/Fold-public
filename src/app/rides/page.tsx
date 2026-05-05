import Link from "next/link";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { events, rideSessions } from "../../../drizzle/schema";
import { eq, gte, asc, desc, sql } from "drizzle-orm";
import { getCurrentUser } from "@/lib/auth";

export const dynamic = "force-dynamic";

export default async function RidesPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const now = new Date();
  const upcoming = await db
    .select()
    .from(events)
    .where(gte(events.startDate, now))
    .orderBy(asc(events.startDate))
    .limit(20);

  const sessionCounts = await Promise.all(
    upcoming.map(async (e) => {
      const [{ c }] = await db
        .select({ c: sql<number>`count(*)` })
        .from(rideSessions)
        .where(eq(rideSessions.eventId, e.id));
      return [e.id, c] as const;
    })
  );
  const countByEvent = new Map<number, number>(sessionCounts);

  const recentSessions = await db
    .select({
      id: rideSessions.id,
      label: rideSessions.label,
      eventId: rideSessions.eventId,
      eventName: events.name,
      eventDate: events.startDate,
      createdAt: rideSessions.createdAt,
    })
    .from(rideSessions)
    .innerJoin(events, eq(events.id, rideSessions.eventId))
    .orderBy(desc(rideSessions.createdAt))
    .limit(5);

  return (
    <div className="max-w-4xl mx-auto px-4 py-8 space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Rides</h1>
        <p className="text-sm text-black/60 mt-1">
          Pick an upcoming event to plan its carpool. Inside, you&apos;ll dump rider names plus
          natural-language hints (&ldquo;put Mike with Sarah, balance the freshmen&rdquo;) and the solver
          places everyone honoring capacity and your safety rule.
        </p>
      </div>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold">Upcoming events</h2>
        {upcoming.length === 0 && (
          <div className="card text-sm text-black/60 text-center py-6">
            No upcoming events.{" "}
            <Link href="/events" className="underline">
              Create one
            </Link>{" "}
            to start planning rides.
          </div>
        )}
        <div className="space-y-3">
          {upcoming.map((e) => {
            const count = countByEvent.get(e.id) ?? 0;
            return (
              <div key={e.id} className="card flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <Link href={`/events/${e.id}`} className="font-medium hover:underline">
                    {e.name}
                  </Link>
                  <div className="text-xs text-black/60 mt-0.5">
                    {new Date(e.startDate).toLocaleString()}
                    {e.location ? ` • ${e.location}` : ""}
                  </div>
                  <div className="text-xs mt-1">
                    {count > 0 ? (
                      <span className="chip">
                        {count} session{count === 1 ? "" : "s"}
                      </span>
                    ) : (
                      <span className="text-black/40">no sessions yet</span>
                    )}
                  </div>
                </div>
                <Link href={`/events/${e.id}/rides`} className="btn-primary whitespace-nowrap">
                  Plan rides →
                </Link>
              </div>
            );
          })}
        </div>
      </section>

      {recentSessions.length > 0 && (
        <section className="space-y-2">
          <h2 className="text-lg font-semibold">Recent ride sessions</h2>
          <div className="card divide-y divide-black/5 dark:divide-white/10">
            {recentSessions.map((s) => (
              <Link
                key={s.id}
                href={`/events/${s.eventId}/rides/${s.id}`}
                className="flex items-center justify-between py-2 hover:opacity-80"
              >
                <div className="min-w-0">
                  <div className="font-medium truncate">
                    {s.eventName} <span className="text-black/40">— {s.label}</span>
                  </div>
                  <div className="text-xs text-black/60">
                    {new Date(s.eventDate).toLocaleDateString()} • last edited{" "}
                    {new Date(s.createdAt).toLocaleString()}
                  </div>
                </div>
                <span className="text-xs text-black/40">→</span>
              </Link>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
