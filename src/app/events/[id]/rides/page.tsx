import Link from "next/link";
import { redirect, notFound } from "next/navigation";
import { db } from "@/lib/db";
import { events, rideSessions, rides, rideAssignments } from "../../../../../drizzle/schema";
import { eq, desc, sql } from "drizzle-orm";
import { getCurrentUser } from "@/lib/auth";
import { createRideSessionAction, deleteRideSessionAction } from "./actions";

export const dynamic = "force-dynamic";

export default async function RideSessionsPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  const { id } = await params;
  const eid = Number(id);
  if (!Number.isFinite(eid)) notFound();

  const [evt] = await db.select().from(events).where(eq(events.id, eid)).limit(1);
  if (!evt) notFound();

  const sessionsList = await db
    .select()
    .from(rideSessions)
    .where(eq(rideSessions.eventId, eid))
    .orderBy(desc(rideSessions.createdAt));

  const stats = await Promise.all(
    sessionsList.map(async (s) => {
      const [{ rideCount }] = await db
        .select({ rideCount: sql<number>`count(*)` })
        .from(rides)
        .where(eq(rides.rideSessionId, s.id));
      const [{ riderCount }] = await db
        .select({ riderCount: sql<number>`count(*)` })
        .from(rideAssignments)
        .where(eq(rideAssignments.rideSessionId, s.id));
      return { sessionId: s.id, rideCount, riderCount };
    })
  );
  const statById = new Map(stats.map((s) => [s.sessionId, s]));

  return (
    <div className="max-w-4xl mx-auto px-4 py-8 space-y-6">
      <div className="flex items-baseline justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">{evt.name} — Rides</h1>
          <div className="text-xs text-black/60 mt-1">{new Date(evt.startDate).toLocaleString()}</div>
        </div>
        <Link href={`/events/${evt.id}`} className="text-sm underline">← event</Link>
      </div>

      <form action={createRideSessionAction} className="card grid grid-cols-1 md:grid-cols-6 gap-3 items-end">
        <input type="hidden" name="eventId" value={evt.id} />
        <div className="space-y-1 md:col-span-4">
          <label className="label" htmlFor="label">New ride session label</label>
          <input id="label" name="label" className="input" placeholder="There / Back / Sunday morning" />
        </div>
        <button type="submit" className="btn-primary md:col-span-2">Create session</button>
      </form>

      <div className="space-y-3">
        {sessionsList.length === 0 && (
          <div className="card text-center text-black/50 py-6 text-sm">
            No ride sessions yet. Create one above.
          </div>
        )}
        {sessionsList.map((s) => {
          const stat = statById.get(s.id);
          return (
            <div key={s.id} className="card flex items-center justify-between">
              <div>
                <div className="font-medium">{s.label}</div>
                <div className="text-xs text-black/60">
                  {stat?.rideCount ?? 0} car(s) • {stat?.riderCount ?? 0} rider(s)
                </div>
              </div>
              <div className="flex items-center gap-3">
                <Link href={`/events/${evt.id}/rides/${s.id}`} className="btn-primary">
                  Open
                </Link>
                <form action={deleteRideSessionAction}>
                  <input type="hidden" name="eventId" value={evt.id} />
                  <input type="hidden" name="sessionId" value={s.id} />
                  <button type="submit" className="btn-ghost text-red-600">Delete</button>
                </form>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
