export type Gender = "M" | "F";

export interface SolverRider {
  riderId: string;
  displayName: string;
  studentId?: number;
  gender?: Gender;
  year?: string;
}

export interface SolverVehicle {
  vehicleId: number;
  name: string;
  capacity: number;
  driverName: string;
  driverGender?: Gender;
  driverStudentId?: number;
}

export interface SolverDirectives {
  groupTogether?: number[][];
  keepApart?: number[][];
  prioritize?: number[];
  pinned?: { studentId: number; vehicleId: number }[];
  balance?: boolean;
}

export interface Assignment {
  vehicleId: number;
  riderIds: string[];
}

export interface Violation {
  vehicleId: number;
  kind: "capacity" | "genderRule";
  message: string;
}

export interface Warning {
  vehicleId: number;
  message: string;
}

export type Unsatisfiable =
  | { kind: "pin_conflict"; message: string }
  | { kind: "seats_short"; message: string };

export interface SolveResult {
  assignments: Assignment[];
  unassigned: string[];
  violations: Violation[];
  warnings: Warning[];
  unsatisfiable: Unsatisfiable[];
}

interface CarState {
  vehicleId: number;
  capacity: number;
  driverGender?: Gender;
  riders: SolverRider[];
}

function countGenders(occupants: { gender?: Gender }[]) {
  let m = 0,
    f = 0,
    u = 0;
  for (const o of occupants) {
    if (o.gender === "M") m++;
    else if (o.gender === "F") f++;
    else u++;
  }
  return { m, f, u };
}

function carOccupants(car: CarState): { gender?: Gender }[] {
  const list: { gender?: Gender }[] = [...car.riders];
  list.push({ gender: car.driverGender });
  return list;
}

function ruleHardViolation(occupants: { gender?: Gender }[]): boolean {
  const { m, f } = countGenders(occupants);
  return (m === 1 && f >= 1) || (f === 1 && m >= 1);
}

function ruleSoftWarning(occupants: { gender?: Gender }[]): boolean {
  const { m, f, u } = countGenders(occupants);
  if (u === 0) return false;
  // Unknown is risky only when there's any known gender of just one kind.
  return (m >= 1 && f === 0) || (f >= 1 && m === 0);
}

function wouldCreateHardViolation(car: CarState, candidate: SolverRider): boolean {
  const occ = [...carOccupants(car), { gender: candidate.gender }];
  return ruleHardViolation(occ);
}

function seatsRemaining(car: CarState): number {
  // capacity already includes the driver seat; driver always occupies one.
  return car.capacity - 1 - car.riders.length;
}

function findRider(riders: SolverRider[], studentId: number): SolverRider | undefined {
  return riders.find((r) => r.studentId === studentId);
}

function buildKeepApartIndex(
  keepApart: number[][] | undefined
): Map<number, Set<number>> {
  const idx = new Map<number, Set<number>>();
  if (!keepApart) return idx;
  for (const group of keepApart) {
    for (const sid of group) {
      const set = idx.get(sid) ?? new Set<number>();
      for (const other of group) if (other !== sid) set.add(other);
      idx.set(sid, set);
    }
  }
  return idx;
}

function buildGroupIndex(
  groupTogether: number[][] | undefined
): Map<number, Set<number>> {
  const idx = new Map<number, Set<number>>();
  if (!groupTogether) return idx;
  for (const group of groupTogether) {
    for (const sid of group) {
      const set = idx.get(sid) ?? new Set<number>();
      for (const other of group) if (other !== sid) set.add(other);
      idx.set(sid, set);
    }
  }
  return idx;
}

function scoreCarFor(
  car: CarState,
  rider: SolverRider,
  groupIdx: Map<number, Set<number>>,
  apartIdx: Map<number, Set<number>>,
  balance: boolean
): number {
  let score = seatsRemaining(car); // prefer cars with more room → spreads
  if (rider.studentId != null) {
    const groupMates = groupIdx.get(rider.studentId);
    if (groupMates) {
      for (const r of car.riders) {
        if (r.studentId != null && groupMates.has(r.studentId)) score += 50;
      }
    }
    const apartMates = apartIdx.get(rider.studentId);
    if (apartMates) {
      for (const r of car.riders) {
        if (r.studentId != null && apartMates.has(r.studentId)) score -= 100;
      }
    }
  }
  if (balance && rider.year) {
    for (const r of car.riders) {
      if (r.year === rider.year) score -= 5;
    }
  }
  return score;
}

function pickBestCar(
  cars: CarState[],
  rider: SolverRider,
  enforceGenderRule: boolean,
  groupIdx: Map<number, Set<number>>,
  apartIdx: Map<number, Set<number>>,
  balance: boolean
): CarState | null {
  let best: CarState | null = null;
  let bestScore = -Infinity;
  for (const car of cars) {
    if (seatsRemaining(car) <= 0) continue;
    if (enforceGenderRule && wouldCreateHardViolation(car, rider)) continue;
    const score = scoreCarFor(car, rider, groupIdx, apartIdx, balance);
    if (score > bestScore) {
      bestScore = score;
      best = car;
    }
  }
  return best;
}

function attemptRepair(cars: CarState[], enforceGenderRule: boolean): void {
  if (!enforceGenderRule) return;
  for (const car of cars) {
    if (!ruleHardViolation(carOccupants(car))) continue;
    const { m, f } = countGenders(carOccupants(car));
    const loneGender: Gender = m === 1 ? "M" : "F";
    const loneIdx = car.riders.findIndex((r) => r.gender === loneGender);
    if (loneIdx === -1) continue; // lone person is the driver — can't move them

    for (const other of cars) {
      if (other === car) continue;
      if (seatsRemaining(other) <= 0) continue;
      const lone = car.riders[loneIdx];
      // 1) Can we just move the lone person to `other`?
      const occAfter = [...carOccupants(other), { gender: lone.gender }];
      if (!ruleHardViolation(occAfter)) {
        car.riders.splice(loneIdx, 1);
        other.riders.push(lone);
        break;
      }
      // 2) Can we swap the lone with a rider in `other` of the OPPOSITE gender of the lone?
      const swapIdx = other.riders.findIndex((r) => r.gender && r.gender !== lone.gender);
      if (swapIdx === -1) continue;
      const swap = other.riders[swapIdx];
      const carAfter = [...carOccupants(car), { gender: swap.gender }].filter(
        (_, i, arr) => arr.indexOf(arr[i]) === i
      );
      // recompute properly: car loses lone, gains swap; other loses swap, gains lone
      const carOcc = [
        ...car.riders.filter((_, i) => i !== loneIdx),
        swap,
        { gender: car.driverGender } as { gender?: Gender },
      ];
      const otherOcc = [
        ...other.riders.filter((_, i) => i !== swapIdx),
        lone,
        { gender: other.driverGender } as { gender?: Gender },
      ];
      if (!ruleHardViolation(carOcc) && !ruleHardViolation(otherOcc)) {
        car.riders.splice(loneIdx, 1);
        car.riders.push(swap);
        other.riders.splice(swapIdx, 1);
        other.riders.push(lone);
        break;
      }
    }
  }
}

export function placeRiders(
  riders: SolverRider[],
  vehicles: SolverVehicle[],
  directives: SolverDirectives,
  enforceGenderRule: boolean
): SolveResult {
  const result: SolveResult = {
    assignments: [],
    unassigned: [],
    violations: [],
    warnings: [],
    unsatisfiable: [],
  };

  // Exclude any rider who is also a driver.
  const driverStudentIds = new Set(
    vehicles.map((v) => v.driverStudentId).filter((x): x is number => typeof x === "number")
  );
  const ridersToSeat = riders.filter(
    (r) => r.studentId == null || !driverStudentIds.has(r.studentId)
  );

  const cars: CarState[] = vehicles.map((v) => ({
    vehicleId: v.vehicleId,
    capacity: v.capacity,
    driverGender: v.driverGender,
    riders: [],
  }));
  const carById = new Map(cars.map((c) => [c.vehicleId, c]));

  const totalSeats = cars.reduce((sum, c) => sum + Math.max(0, c.capacity - 1), 0);
  if (totalSeats < ridersToSeat.length) {
    result.unsatisfiable.push({
      kind: "seats_short",
      message: `${ridersToSeat.length} rider(s) for ${totalSeats} passenger seat(s).`,
    });
  }

  const placedIds = new Set<string>();
  const place = (rider: SolverRider, car: CarState) => {
    car.riders.push(rider);
    placedIds.add(rider.riderId);
  };

  // 1) Pinned placements (hard).
  for (const pin of directives.pinned ?? []) {
    const rider = findRider(ridersToSeat, pin.studentId);
    if (!rider) continue;
    if (placedIds.has(rider.riderId)) continue;
    const car = carById.get(pin.vehicleId);
    if (!car) {
      result.unsatisfiable.push({
        kind: "pin_conflict",
        message: `Pin references unknown vehicle ${pin.vehicleId}.`,
      });
      continue;
    }
    if (seatsRemaining(car) <= 0) {
      result.unsatisfiable.push({
        kind: "pin_conflict",
        message: `Cannot pin ${rider.displayName} to vehicle ${pin.vehicleId}: full.`,
      });
      continue;
    }
    if (enforceGenderRule && wouldCreateHardViolation(car, rider)) {
      result.unsatisfiable.push({
        kind: "pin_conflict",
        message: `Cannot pin ${rider.displayName} to vehicle ${pin.vehicleId}: would violate gender rule.`,
      });
      continue;
    }
    place(rider, car);
  }

  const groupIdx = buildGroupIndex(directives.groupTogether);
  const apartIdx = buildKeepApartIndex(directives.keepApart);
  const balance = !!directives.balance;
  const priorities = new Set(directives.prioritize ?? []);

  // 2) Group anchors then group members. Process groups in given order; within each
  //    group, seat the highest-priority unplaced rider first as anchor, then the rest
  //    targeting the anchor's car if feasible.
  for (const group of directives.groupTogether ?? []) {
    const groupRiders = group
      .map((sid) => findRider(ridersToSeat, sid))
      .filter((r): r is SolverRider => !!r && !placedIds.has(r.riderId));
    if (groupRiders.length === 0) continue;
    // seat first one greedily
    const anchor = groupRiders[0];
    const anchorCar = pickBestCar(cars, anchor, enforceGenderRule, groupIdx, apartIdx, balance);
    if (!anchorCar) continue;
    place(anchor, anchorCar);
    for (let i = 1; i < groupRiders.length; i++) {
      const r = groupRiders[i];
      if (placedIds.has(r.riderId)) continue;
      // Prefer the anchor's car if it has space and is legal.
      if (
        seatsRemaining(anchorCar) > 0 &&
        (!enforceGenderRule || !wouldCreateHardViolation(anchorCar, r))
      ) {
        place(r, anchorCar);
      } else {
        const c = pickBestCar(cars, r, enforceGenderRule, groupIdx, apartIdx, balance);
        if (c) place(r, c);
      }
    }
  }

  // 3) Prioritized riders.
  for (const sid of directives.prioritize ?? []) {
    const r = findRider(ridersToSeat, sid);
    if (!r || placedIds.has(r.riderId)) continue;
    const c = pickBestCar(cars, r, enforceGenderRule, groupIdx, apartIdx, balance);
    if (c) place(r, c);
  }

  // 4) Everyone else, sorted to put gendered riders first (helps the rule satisfy).
  const remaining = ridersToSeat
    .filter((r) => !placedIds.has(r.riderId))
    .sort((a, b) => {
      // priority riders first (already placed but in case any failed)
      const ap = a.studentId != null && priorities.has(a.studentId) ? 1 : 0;
      const bp = b.studentId != null && priorities.has(b.studentId) ? 1 : 0;
      if (ap !== bp) return bp - ap;
      // gendered riders before unknowns (placement constraints are clearer)
      const ag = a.gender ? 1 : 0;
      const bg = b.gender ? 1 : 0;
      return bg - ag;
    });
  for (const r of remaining) {
    const c = pickBestCar(cars, r, enforceGenderRule, groupIdx, apartIdx, balance);
    if (c) place(r, c);
  }

  // 5) Repair pass for gender rule.
  attemptRepair(cars, enforceGenderRule);

  // Build assignments and unassigned.
  result.assignments = cars.map((c) => ({
    vehicleId: c.vehicleId,
    riderIds: c.riders.map((r) => r.riderId),
  }));
  result.unassigned = ridersToSeat
    .filter((r) => !placedIds.has(r.riderId))
    .map((r) => r.riderId);

  // Compute violations and warnings.
  const validation = validateAssignment(riders, vehicles, result.assignments, enforceGenderRule);
  result.violations = validation.violations;
  result.warnings = validation.warnings;

  return result;
}

export function validateAssignment(
  riders: SolverRider[],
  vehicles: SolverVehicle[],
  assignments: Assignment[],
  enforceGenderRule: boolean
): { violations: Violation[]; warnings: Warning[] } {
  const violations: Violation[] = [];
  const warnings: Warning[] = [];
  const ridersById = new Map(riders.map((r) => [r.riderId, r]));

  for (const a of assignments) {
    const v = vehicles.find((x) => x.vehicleId === a.vehicleId);
    if (!v) continue;
    const occupants: { gender?: Gender }[] = [];
    if (v.driverGender) occupants.push({ gender: v.driverGender });
    else occupants.push({ gender: undefined });
    for (const rid of a.riderIds) {
      const r = ridersById.get(rid);
      if (r) occupants.push({ gender: r.gender });
    }
    const occCount = occupants.length;
    if (occCount > v.capacity) {
      violations.push({
        vehicleId: v.vehicleId,
        kind: "capacity",
        message: `${v.name} has ${occCount} occupant(s) but capacity is ${v.capacity}.`,
      });
    }
    if (enforceGenderRule) {
      if (ruleHardViolation(occupants)) {
        violations.push({
          vehicleId: v.vehicleId,
          kind: "genderRule",
          message: `${v.name} has a single rider alone with the opposite gender.`,
        });
      } else if (ruleSoftWarning(occupants)) {
        warnings.push({
          vehicleId: v.vehicleId,
          message: `${v.name} has a passenger with unknown gender — set gender on the student to clear this.`,
        });
      }
    }
  }
  return { violations, warnings };
}
