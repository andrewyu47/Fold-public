import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { students, vehicles as vehiclesTable } from "../../../../../drizzle/schema";
import { asc } from "drizzle-orm";
import { anthropic, MODEL } from "@/lib/claude";
import { getCurrentUser } from "@/lib/auth";
import { PROPOSE_FLEET_TOOL } from "@/lib/rides/claude-tools";
import type { FleetParsePreview, VehicleInPlay, Gender } from "@/lib/rides/shared";

interface ToolInput {
  vehicles?: Array<{
    match: "saved" | "ad_hoc";
    savedVehicleId?: number;
    name: string;
    capacity: number;
    driverName: string;
    driverStudentId?: number;
    driverGender?: Gender;
    rawText: string;
  }>;
  ambiguousVehicleNames?: string[];
  explanation?: string;
}

export async function POST(req: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  let body: { text?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "bad json" }, { status: 400 });
  }
  const text = (body.text ?? "").trim();
  if (!text) return NextResponse.json({ error: "empty text" }, { status: 400 });

  const fleet = await db.select().from(vehiclesTable).orderBy(asc(vehiclesTable.name));
  const activeFleet = fleet.filter((v) => v.isActive);
  const roster = await db
    .select({
      id: students.id,
      firstName: students.firstName,
      lastName: students.lastName,
      gender: students.gender,
    })
    .from(students);

  const fleetCompact = activeFleet
    .map((v) => `${v.id}|${v.name}, capacity ${v.capacity}`)
    .join("\n");
  const rosterCompact = roster
    .map((r) => {
      const g = r.gender ? ` [${r.gender}]` : "";
      return `${r.id}|${r.firstName}${r.lastName ? " " + r.lastName : ""}${g}`;
    })
    .join("\n");

  const system = `You parse a free-text description of which vehicles + drivers will be used for a carpool, matching against the saved fleet whenever possible.

Rules:
- For each vehicle the organizer mentions, decide saved (matches a fleet entry by name) vs. ad_hoc.
- Use saved capacity unless the organizer explicitly overrides it ("Sienna with only 6 seats tonight").
- Drivers may be referenced by first name only — fuzzy-match against the roster (Mike/Michael, Jess/Jessica). If matched, set driverStudentId and inherit driverGender from roster.
- Phrasing like "Sarah's car," "Sarah driving," or "Sarah's Sienna" all mean Sarah is the driver.
- If a vehicle name matches 0 or 2+ fleet entries, list it under ambiguousVehicleNames and skip it.
- Return rawText as the exact substring of input that produced each entry.
- Drivers are NOT riders. Don't list them as people to seat — that's a separate parse step.`;

  const userMsg = `Saved fleet (id|name, capacity):
${fleetCompact || "(empty fleet)"}

Roster (id|name [gender]):
${rosterCompact || "(empty roster)"}

Leader's description:
${text}`;

  let resp;
  try {
    resp = await anthropic.messages.create({
      model: MODEL,
      max_tokens: 1024,
      system,
      tools: [PROPOSE_FLEET_TOOL],
      tool_choice: { type: "tool", name: PROPOSE_FLEET_TOOL.name },
      messages: [{ role: "user", content: userMsg }],
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "claude failed" },
      { status: 502 }
    );
  }

  const toolUse = resp.content.find((b) => b.type === "tool_use");
  if (!toolUse || toolUse.type !== "tool_use") {
    return NextResponse.json({ error: "claude returned no tool use" }, { status: 502 });
  }

  const input = toolUse.input as ToolInput;
  const fleetById = new Map(fleet.map((v) => [v.id, v]));
  const rosterById = new Map(roster.map((r) => [r.id, r]));

  const seenIds = new Set<number>();
  const vehicles: VehicleInPlay[] = [];
  let adHocCounter = 0;

  for (const v of input.vehicles ?? []) {
    let vehicleId: number;
    let name = v.name;
    let capacity = v.capacity;

    if (v.match === "saved" && typeof v.savedVehicleId === "number" && fleetById.has(v.savedVehicleId)) {
      if (seenIds.has(v.savedVehicleId)) continue; // dedupe
      seenIds.add(v.savedVehicleId);
      const sv = fleetById.get(v.savedVehicleId)!;
      vehicleId = sv.id;
      name = sv.name;
      if (!Number.isFinite(capacity) || capacity <= 0) capacity = sv.capacity;
    } else {
      adHocCounter += 1;
      vehicleId = -(Date.now() % 1_000_000 + adHocCounter); // negative = ad-hoc, matches editor convention
      if (!Number.isFinite(capacity) || capacity <= 0) capacity = 5;
    }

    let driverGender = v.driverGender;
    let driverStudentId = v.driverStudentId;
    if (typeof driverStudentId === "number" && rosterById.has(driverStudentId)) {
      const s = rosterById.get(driverStudentId)!;
      if (!driverGender && s.gender) driverGender = s.gender;
    } else {
      driverStudentId = undefined;
    }

    vehicles.push({
      vehicleId,
      name,
      capacity: Math.max(2, Math.min(20, Math.round(capacity))),
      driverName: v.driverName.trim(),
      driverGender,
      driverStudentId,
    });
  }

  const preview: FleetParsePreview = {
    vehicles,
    ambiguousVehicleNames: input.ambiguousVehicleNames ?? [],
    explanation: input.explanation ?? `Parsed ${vehicles.length} vehicle(s).`,
  };
  return NextResponse.json(preview);
}
