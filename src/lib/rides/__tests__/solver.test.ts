import { test } from "node:test";
import assert from "node:assert/strict";
import {
  placeRiders,
  validateAssignment,
  type SolverRider,
  type SolverVehicle,
} from "../solver";

const r = (id: string, gender?: "M" | "F", studentId?: number, year?: string): SolverRider => ({
  riderId: id,
  displayName: id,
  studentId,
  gender,
  year,
});

const v = (
  id: number,
  capacity: number,
  driverGender?: "M" | "F",
  driverStudentId?: number
): SolverVehicle => ({
  vehicleId: id,
  name: `Car${id}`,
  capacity,
  driverName: `Driver${id}`,
  driverGender,
  driverStudentId,
});

test("capacity overflow → riders unassigned", () => {
  const riders = [r("a", "M", 1), r("b", "M", 2), r("c", "M", 3)];
  const vehicles = [v(1, 2)]; // 1 driver seat + 1 passenger
  const out = placeRiders(riders, vehicles, {}, false);
  assert.equal(out.assignments[0].riderIds.length, 1);
  assert.equal(out.unassigned.length, 2);
  assert.equal(out.unsatisfiable.length, 1);
  assert.equal(out.unsatisfiable[0].kind, "seats_short");
});

test("gender rule: 1M + 2F across 2 cars — solver puts both Fs together", () => {
  // 1 male + 2 female, two 4-seat cars (3 passenger seats each), no driver gender set.
  const riders = [r("m1", "M", 1), r("f1", "F", 2), r("f2", "F", 3)];
  const vehicles = [v(1, 4), v(2, 4)];
  const out = placeRiders(riders, vehicles, {}, true);
  assert.equal(out.unassigned.length, 0);
  assert.equal(out.violations.length, 0, JSON.stringify(out.violations));
  // m1 should be in a car with no F
  const mCar = out.assignments.find((a) => a.riderIds.includes("m1"))!;
  const fCar = out.assignments.find((a) => a.vehicleId !== mCar.vehicleId)!;
  assert.ok(!mCar.riderIds.some((id) => id.startsWith("f")));
  assert.equal(fCar.riderIds.length, 2);
});

test("gender rule OFF: any composition allowed", () => {
  const riders = [r("m1", "M", 1), r("f1", "F", 2)];
  const vehicles = [v(1, 4)];
  const out = placeRiders(riders, vehicles, {}, false);
  assert.equal(out.violations.length, 0);
  assert.equal(out.unassigned.length, 0);
});

test("rule symmetric: 1F with ≥1M flagged", () => {
  // 2 males + 1 female, one 4-seat car. With rule on, this is unsatisfiable in 1 car
  // (1F + 2M). The placer should refuse to seat the F there.
  const riders = [r("m1", "M", 1), r("m2", "M", 2), r("f1", "F", 3)];
  const vehicles = [v(1, 4)];
  const out = placeRiders(riders, vehicles, {}, true);
  assert.ok(out.unassigned.includes("f1"), "female should be unassigned");
});

test("driver gender counts: lone M driver + 1F passenger = violation", () => {
  const riders = [r("f1", "F", 1)];
  const vehicles = [v(1, 4, "M")]; // driver is M
  const out = placeRiders(riders, vehicles, {}, true);
  // F can't be seated (would be alone with M driver).
  assert.ok(out.unassigned.includes("f1"));
});

test("driver gender unknown → warning, not violation", () => {
  const riders = [r("f1", "F", 1), r("f2", "F", 2)];
  const vehicles = [v(1, 4)]; // no driverGender
  const out = placeRiders(riders, vehicles, {}, true);
  assert.equal(out.violations.length, 0);
  assert.ok(out.warnings.length >= 1);
});

test("groupTogether honored when feasible", () => {
  const riders = [
    r("a", "M", 1),
    r("b", "M", 2),
    r("c", "F", 3),
    r("d", "F", 4),
  ];
  const vehicles = [v(1, 4), v(2, 4)];
  const out = placeRiders(riders, vehicles, { groupTogether: [[1, 2]] }, true);
  const aCar = out.assignments.find((x) => x.riderIds.includes("a"))!;
  assert.ok(aCar.riderIds.includes("b"), "b should be with a");
});

test("pinned: places rider on specified vehicle", () => {
  const riders = [r("a", "M", 1), r("b", "M", 2)];
  const vehicles = [v(1, 4), v(2, 4)];
  const out = placeRiders(riders, vehicles, { pinned: [{ studentId: 2, vehicleId: 1 }] }, false);
  const car1 = out.assignments.find((x) => x.vehicleId === 1)!;
  assert.ok(car1.riderIds.includes("b"));
});

test("pin to full vehicle reports unsatisfiable", () => {
  const riders = [r("a", "M", 1), r("b", "M", 2), r("c", "M", 3), r("d", "M", 4)];
  // Car capacity 2 = 1 driver + 1 passenger. Pin two riders.
  const vehicles = [v(1, 2)];
  const out = placeRiders(
    riders,
    vehicles,
    { pinned: [{ studentId: 1, vehicleId: 1 }, { studentId: 2, vehicleId: 1 }] },
    false
  );
  assert.ok(out.unsatisfiable.some((u) => u.kind === "pin_conflict"));
});

test("driver-as-student excluded from rider pool", () => {
  // Rostered driver id 99. Should not be placed even if listed as a rider.
  const riders = [r("driver", "M", 99), r("a", "M", 1)];
  const vehicles = [v(1, 4, "M", 99)];
  const out = placeRiders(riders, vehicles, {}, false);
  const car = out.assignments[0];
  assert.ok(!car.riderIds.includes("driver"));
  assert.ok(car.riderIds.includes("a"));
  assert.ok(!out.unassigned.includes("driver"));
});

test("validateAssignment flags capacity overflow", () => {
  const riders = [r("a", "M"), r("b", "F"), r("c", "M"), r("d", "F")];
  const vehicles = [v(1, 3)]; // capacity 3 = 1 driver + 2 passenger seats
  const assignments = [{ vehicleId: 1, riderIds: ["a", "b", "c", "d"] }];
  const out = validateAssignment(riders, vehicles, assignments, true);
  assert.ok(out.violations.some((v) => v.kind === "capacity"));
});

test("validateAssignment flags hard gender violation", () => {
  const riders = [r("m1", "M"), r("f1", "F"), r("f2", "F")];
  const vehicles = [v(1, 6)]; // big car
  const assignments = [{ vehicleId: 1, riderIds: ["m1", "f1", "f2"] }];
  const out = validateAssignment(riders, vehicles, assignments, true);
  assert.ok(out.violations.some((v) => v.kind === "genderRule"));
});

test("validateAssignment passes for 2M+2F", () => {
  const riders = [r("m1", "M"), r("m2", "M"), r("f1", "F"), r("f2", "F")];
  const vehicles = [v(1, 6)];
  const assignments = [{ vehicleId: 1, riderIds: ["m1", "m2", "f1", "f2"] }];
  const out = validateAssignment(riders, vehicles, assignments, true);
  assert.equal(out.violations.length, 0);
});

test("balance flag: spreads same-year riders across cars", () => {
  const riders = [
    r("a", "M", 1, "freshman"),
    r("b", "M", 2, "freshman"),
    r("c", "M", 3, "freshman"),
    r("d", "M", 4, "freshman"),
  ];
  const vehicles = [v(1, 4), v(2, 4)];
  const out = placeRiders(riders, vehicles, { balance: true }, false);
  // Both cars should have 2 freshmen, not 4-0.
  const counts = out.assignments.map((a) => a.riderIds.length);
  assert.deepEqual(counts.sort(), [2, 2]);
});
