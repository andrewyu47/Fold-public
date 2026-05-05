import Link from "next/link";
import { redirect, notFound } from "next/navigation";
import { db } from "@/lib/db";
import {
  events,
  rideSessions,
  rides,
  rideAssignments,
  vehicles as vehiclesTable,
  students,
} from "../../../../../../drizzle/schema";
import { eq, asc, and } from "drizzle-orm";
import { getCurrentUser } from "@/lib/auth";
import RideSessionEditor from "@/components/RideSessionEditor";
import type { ParsedRider, PreviewAssignment, VehicleInPlay } from "@/lib/rides/shared";

export const dynamic = "force-dynamic";

export default async function RideSessionEditorPage({
  params,
}: {
  params: Promise<{ id: string; sessionId: string }>;
}) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  const { id, sessionId: sid } = await params;
  const eid = Number(id);
  const ssid = Number(sid);
  if (!Number.isFinite(eid) || !Number.isFinite(ssid)) notFound();

  const [evt] = await db.select().from(events).where(eq(events.id, eid)).limit(1);
  if (!evt) notFound();
  const [session] = await db
    .select()
    .from(rideSessions)
    .where(and(eq(rideSessions.id, ssid), eq(rideSessions.eventId, eid)))
    .limit(1);
  if (!session) notFound();

  const allVehicles = await db.select().from(vehiclesTable).orderBy(asc(vehiclesTable.name));

  const existingRides = await db
    .select()
    .from(rides)
    .where(eq(rides.rideSessionId, ssid));
  const existingAssignments = await db
    .select()
    .from(rideAssignments)
    .where(eq(rideAssignments.rideSessionId, ssid));

  let initialVehicles: VehicleInPlay[] = [];
  let initialAssignments: PreviewAssignment[] = [];
  let initialRiders: ParsedRider[] = [];

  if (existingRides.length > 0) {
    initialVehicles = existingRides.map((r) => ({
      vehicleId: r.vehicleId ?? r.id,
      name: r.vehicleNameSnapshot,
      capacity: r.capacitySnapshot,
      driverName: r.driverName,
      driverGender: r.driverGender ?? undefined,
      driverStudentId: r.driverStudentId ?? undefined,
    }));
    const studentIds = Array.from(new Set(existingAssignments.map((a) => a.studentId)));
    const sById = new Map<number, typeof students.$inferSelect>();
    for (const sid of studentIds) {
      const [s] = await db.select().from(students).where(eq(students.id, sid)).limit(1);
      if (s) sById.set(s.id, s);
    }
    initialRiders = existingAssignments.map((a) => {
      const s = sById.get(a.studentId);
      const display = s ? `${s.firstName}${s.lastName ? " " + s.lastName : ""}` : `student ${a.studentId}`;
      return {
        match: "existing",
        studentId: a.studentId,
        firstName: s?.firstName,
        lastName: s?.lastName ?? undefined,
        gender: s?.gender ?? undefined,
        year: s?.year ?? undefined,
        rawText: display,
        riderId: `s:${a.studentId}`,
        displayName: display,
      };
    });
    initialAssignments = existingRides.map((r) => ({
      vehicleId: r.vehicleId ?? r.id,
      riderIds: existingAssignments
        .filter((a) => a.rideId === r.id)
        .map((a) => `s:${a.studentId}`),
    }));
  }

  return (
    <div className="max-w-6xl mx-auto px-4 py-6 space-y-4">
      <div className="flex items-baseline justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">
            {evt.name} — {session.label}
          </h1>
          <div className="text-xs text-black/60 mt-1">{new Date(evt.startDate).toLocaleString()}</div>
        </div>
        <Link href={`/events/${eid}/rides`} className="text-sm underline">
          ← all sessions
        </Link>
      </div>

      <RideSessionEditor
        sessionId={ssid}
        initialEnforceRule={session.enforceGenderRule}
        savedVehicles={allVehicles.map((v) => ({
          id: v.id,
          name: v.name,
          capacity: v.capacity,
        }))}
        initialVehicles={initialVehicles}
        initialRiders={initialRiders}
        initialAssignments={initialAssignments}
        hasCommittedState={existingRides.length > 0}
      />
    </div>
  );
}
