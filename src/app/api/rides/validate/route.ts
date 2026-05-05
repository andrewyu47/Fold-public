import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { validateAssignment, type SolverRider, type SolverVehicle } from "@/lib/rides/solver";
import type { ParsedRider, VehicleInPlay, PreviewAssignment } from "@/lib/rides/shared";

interface Body {
  riders?: ParsedRider[];
  vehicles?: VehicleInPlay[];
  assignments?: PreviewAssignment[];
  enforceGenderRule?: boolean;
}

export async function POST(req: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const body = (await req.json()) as Body;
  const riders = body.riders ?? [];
  const vehicles = body.vehicles ?? [];
  const assignments = body.assignments ?? [];
  const enforceGenderRule = body.enforceGenderRule !== false;

  const solverRiders: SolverRider[] = riders.map((r) => ({
    riderId: r.riderId,
    displayName: r.displayName,
    studentId: r.match === "existing" ? r.studentId : undefined,
    gender: r.gender,
    year: r.year,
  }));
  const solverVehicles: SolverVehicle[] = vehicles.map((v) => ({
    vehicleId: v.vehicleId,
    name: v.name,
    capacity: v.capacity,
    driverName: v.driverName,
    driverGender: v.driverGender,
    driverStudentId: v.driverStudentId,
  }));

  const out = validateAssignment(solverRiders, solverVehicles, assignments, enforceGenderRule);
  return NextResponse.json(out);
}
