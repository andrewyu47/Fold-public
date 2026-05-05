import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import {
  students,
  rideSessions,
  rides,
  rideAssignments,
  vehicles as vehiclesTable,
} from "../../../../../drizzle/schema";
import { eq } from "drizzle-orm";
import { getCurrentUser } from "@/lib/auth";
import type { ParsedRider, VehicleInPlay, PreviewAssignment } from "@/lib/rides/shared";

interface Body {
  sessionId?: number;
  enforceGenderRule?: boolean;
  vehicles?: VehicleInPlay[];
  riders?: ParsedRider[];
  assignments?: PreviewAssignment[];
}

export async function POST(req: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const body = (await req.json()) as Body;
  const sessionId = Number(body.sessionId);
  if (!Number.isFinite(sessionId)) {
    return NextResponse.json({ error: "missing sessionId" }, { status: 400 });
  }
  const enforceGenderRule = body.enforceGenderRule !== false;
  const vehiclesInPlay = body.vehicles ?? [];
  const riders = body.riders ?? [];
  const assignments = body.assignments ?? [];

  const [session] = await db.select().from(rideSessions).where(eq(rideSessions.id, sessionId)).limit(1);
  if (!session) return NextResponse.json({ error: "session not found" }, { status: 404 });

  const riderIdToStudentId = new Map<string, number>();
  let createdCount = 0;
  for (const r of riders) {
    if (r.match === "existing" && typeof r.studentId === "number") {
      riderIdToStudentId.set(r.riderId, r.studentId);
      continue;
    }
    if (r.match === "new" && r.firstName) {
      const [row] = await db
        .insert(students)
        .values({
          firstName: r.firstName,
          lastName: r.lastName ?? null,
          gender: r.gender ?? null,
          year: (r.year as never) ?? null,
          phone: r.phone ?? null,
          notes: r.notes ?? null,
          addedByUserId: user.id,
        })
        .returning();
      riderIdToStudentId.set(r.riderId, row.id);
      createdCount++;
    }
  }

  const vehicleIds = vehiclesInPlay.map((v) => v.vehicleId).filter((id) => id > 0);
  const vehicleById = new Map<number, typeof vehiclesTable.$inferSelect>();
  for (const id of vehicleIds) {
    if (vehicleById.has(id)) continue;
    const [v] = await db.select().from(vehiclesTable).where(eq(vehiclesTable.id, id)).limit(1);
    if (v) vehicleById.set(v.id, v);
  }

  await db
    .update(rideSessions)
    .set({ enforceGenderRule, recordedBy: user.id })
    .where(eq(rideSessions.id, sessionId));

  await db.delete(rideAssignments).where(eq(rideAssignments.rideSessionId, sessionId));
  await db.delete(rides).where(eq(rides.rideSessionId, sessionId));

  let assignedCount = 0;
  for (const a of assignments) {
    const inPlay = vehiclesInPlay.find((v) => v.vehicleId === a.vehicleId);
    if (!inPlay) continue;
    const live = vehicleById.get(a.vehicleId);
    const [rideRow] = await db
      .insert(rides)
      .values({
        rideSessionId: sessionId,
        vehicleId: live ? live.id : null,
        vehicleNameSnapshot: inPlay.name,
        capacitySnapshot: inPlay.capacity,
        driverName: inPlay.driverName,
        driverStudentId: inPlay.driverStudentId ?? null,
        driverGender: inPlay.driverGender ?? null,
      })
      .returning();
    for (const rid of a.riderIds) {
      const sid = riderIdToStudentId.get(rid);
      if (!sid) continue;
      try {
        await db.insert(rideAssignments).values({
          rideId: rideRow.id,
          rideSessionId: sessionId,
          studentId: sid,
        });
        assignedCount++;
      } catch {
        // unique constraint = student already in this session, skip
      }
    }
  }

  return NextResponse.json({ ok: true, created: createdCount, assigned: assignedCount });
}
