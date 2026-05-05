// Types shared between server and client UI for the rides parse/commit flow.

export type Gender = "M" | "F";

export interface ParsedRider {
  match: "existing" | "new";
  studentId?: number;
  firstName?: string;
  lastName?: string;
  gender?: Gender;
  year?: string;
  phone?: string;
  notes?: string;
  rawText: string;
  // Filled in server-side after parse:
  riderId: string;
  displayName: string;
}

export interface ParsedDirectives {
  groupTogether?: number[][];
  keepApart?: number[][];
  prioritize?: number[];
  pinned?: { studentId: number; vehicleId: number }[];
  balance?: boolean;
}

export interface VehicleInPlay {
  vehicleId: number;
  name: string;
  capacity: number;
  driverName: string;
  driverGender?: Gender;
  driverStudentId?: number;
}

export interface PreviewAssignment {
  vehicleId: number;
  riderIds: string[];
}

export interface PreviewViolation {
  vehicleId: number;
  kind: "capacity" | "genderRule";
  message: string;
}

export interface PreviewWarning {
  vehicleId: number;
  message: string;
}

export interface PreviewUnsatisfiable {
  kind: "pin_conflict" | "seats_short";
  message: string;
}

export interface FleetParsePreview {
  vehicles: VehicleInPlay[];
  ambiguousVehicleNames: string[];
  explanation: string;
}

export interface ParsePreview {
  riders: ParsedRider[];
  directives: ParsedDirectives;
  ambiguous: string[];
  explanation: string;
  vehicles: VehicleInPlay[];
  enforceGenderRule: boolean;
  assignments: PreviewAssignment[];
  unassigned: string[];
  violations: PreviewViolation[];
  warnings: PreviewWarning[];
  unsatisfiable: PreviewUnsatisfiable[];
}
