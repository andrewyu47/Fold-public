import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { students, rideSessions } from "../../../../../drizzle/schema";
import { eq } from "drizzle-orm";
import { anthropic, MODEL } from "@/lib/claude";
import { getCurrentUser } from "@/lib/auth";
import { PROPOSE_RIDE_PLAN_TOOL } from "@/lib/rides/claude-tools";
import { placeRiders, type SolverRider, type SolverVehicle } from "@/lib/rides/solver";
import type {
  ParsePreview,
  ParsedRider,
  ParsedDirectives,
  VehicleInPlay,
} from "@/lib/rides/shared";

interface ToolInput {
  riders?: Array<{
    match: "existing" | "new";
    studentId?: number;
    firstName?: string;
    lastName?: string;
    gender?: "M" | "F";
    year?: string;
    phone?: string;
    notes?: string;
    rawText: string;
  }>;
  directives?: ParsedDirectives;
  ambiguous?: string[];
  explanation?: string;
}

export async function POST(req: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  let body: {
    sessionId?: number;
    text?: string;
    vehicles?: VehicleInPlay[];
    enforceGenderRule?: boolean;
  };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "bad json" }, { status: 400 });
  }
  const sessionId = Number(body.sessionId);
  const text = (body.text ?? "").trim();
  const vehiclesInPlay = Array.isArray(body.vehicles) ? body.vehicles : [];
  const enforceGenderRule = body.enforceGenderRule === true;

  if (!Number.isFinite(sessionId)) {
    return NextResponse.json({ error: "missing sessionId" }, { status: 400 });
  }
  if (vehiclesInPlay.length === 0) {
    return NextResponse.json({ error: "need at least 1 vehicle in play" }, { status: 400 });
  }

  const [session] = await db.select().from(rideSessions).where(eq(rideSessions.id, sessionId)).limit(1);
  if (!session) return NextResponse.json({ error: "session not found" }, { status: 404 });

  const roster = await db
    .select({
      id: students.id,
      firstName: students.firstName,
      lastName: students.lastName,
      gender: students.gender,
      year: students.year,
    })
    .from(students);

  const rosterCompact = roster
    .map((r) => {
      const tags: string[] = [];
      if (r.gender) tags.push(r.gender);
      if (r.year) tags.push(r.year);
      const tail = tags.length ? ` [${tags.join(",")}]` : "";
      return `${r.id}|${r.firstName}${r.lastName ? " " + r.lastName : ""}${tail}`;
    })
    .join("\n");

  const vehiclesCompact = vehiclesInPlay
    .map((v) => {
      const dg = v.driverGender ? ` (${v.driverGender})` : "";
      return `${v.vehicleId}|${v.name}, capacity ${v.capacity}, driver ${v.driverName}${dg}`;
    })
    .join("\n");

  const system = `You parse a free-text rider list for a carpool and extract any soft directives the organizer wrote. You DO NOT decide final seating — a deterministic solver does that next.

For each rider in the input:
- If they look like an existing roster entry (fuzzy match first/last name; nicknames like Mike/Michael, Jess/Jessica), set match="existing" with that studentId. Inherit gender/year from the roster — DO NOT re-infer.
- Otherwise match="new". Extract attributes the organizer mentions parenthetically. For "bro/brother/guy" infer gender="M". For "sister/girl" infer gender="F". Only set gender if clearly indicated.
- Always include rawText with the exact substring you parsed for that rider.

Drivers are NOT riders — the organizer has already specified them per-vehicle. Do not include drivers in the riders array.

For directives, look for natural-language hints and translate to studentIds whenever possible:
- "put X with Y", "keep A and B together" → groupTogether
- "don't put X with Y", "split A and B" → keepApart
- "X must drive in car N", "put X in the Sienna" → pinned (use vehicleId)
- "balance freshmen" / "spread the new people" / "mix it up" → balance: true
- "seat X first" / "make sure X has a seat" → prioritize

If the organizer's text mentions anything about gender safety, no one alone with the opposite gender, or enforcing a gender rule, set enforceGenderRule: true in the directives. Otherwise default enforceGenderRule to false.

If a name matches 0 or 2+ roster entries, list it under \`ambiguous\` instead of guessing.`;

  const userMsg = `Roster (id|name [tags]):
${rosterCompact || "(empty roster)"}

Vehicles in play (id|description):
${vehiclesCompact}

Gender rule enforcement: ${enforceGenderRule ? "ON" : "OFF"}

Rider text + leader's natural-language hints:
${text}`;

  let resp;
  try {
    resp = await anthropic.messages.create({
      model: MODEL,
      max_tokens: 2048,
      system,
      tools: [PROPOSE_RIDE_PLAN_TOOL],
      tool_choice: { type: "tool", name: PROPOSE_RIDE_PLAN_TOOL.name },
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
  const rosterById = new Map(roster.map((r) => [r.id, r]));

  const parsedRiders: ParsedRider[] = (input.riders ?? []).map((r, i) => {
    if (r.match === "existing" && typeof r.studentId === "number" && rosterById.has(r.studentId)) {
      const s = rosterById.get(r.studentId)!;
      return {
        ...r,
        riderId: `s:${s.id}`,
        displayName: `${s.firstName}${s.lastName ? " " + s.lastName : ""}`,
        gender: s.gender ?? undefined,
        year: s.year ?? undefined,
      };
    }
    const display =
      [r.firstName, r.lastName].filter(Boolean).join(" ").trim() || r.rawText.trim();
    return {
      ...r,
      match: "new",
      riderId: `n:${i}`,
      displayName: display,
    };
  });

  const seen = new Set<string>();
  const dedupedRiders = parsedRiders.filter((r) => {
    if (seen.has(r.riderId)) return false;
    seen.add(r.riderId);
    return true;
  });

  const directives: ParsedDirectives = input.directives ?? {};

  // Allow the model to enable enforceGenderRule via directives when the user's text mentions it
  const finalEnforceGenderRule = enforceGenderRule || (input.directives as Record<string, unknown>)?.enforceGenderRule === true;

  const solverRiders: SolverRider[] = dedupedRiders.map((r) => ({
    riderId: r.riderId,
    displayName: r.displayName,
    studentId: r.match === "existing" ? r.studentId : undefined,
    gender: r.gender,
    year: r.year,
  }));
  const solverVehicles: SolverVehicle[] = vehiclesInPlay.map((v) => ({
    vehicleId: v.vehicleId,
    name: v.name,
    capacity: v.capacity,
    driverName: v.driverName,
    driverGender: v.driverGender,
    driverStudentId: v.driverStudentId,
  }));
  const solved = placeRiders(solverRiders, solverVehicles, directives, finalEnforceGenderRule);

  const preview: ParsePreview = {
    riders: dedupedRiders,
    directives,
    ambiguous: input.ambiguous ?? [],
    explanation: input.explanation ?? `Parsed ${dedupedRiders.length} rider(s).`,
    vehicles: vehiclesInPlay,
    enforceGenderRule: finalEnforceGenderRule,
    assignments: solved.assignments,
    unassigned: solved.unassigned,
    violations: solved.violations,
    warnings: solved.warnings,
    unsatisfiable: solved.unsatisfiable,
  };

  return NextResponse.json(preview);
}
