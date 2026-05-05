import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { students, events } from "../../../../drizzle/schema";
import { eq } from "drizzle-orm";
import { anthropic, MODEL, PARSE_ATTENDANCE_TOOL } from "@/lib/claude";
import { getCurrentUser } from "@/lib/auth";

export async function POST(req: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  let body: { eventId?: number; text?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "bad json" }, { status: 400 });
  }
  const eventId = Number(body.eventId);
  const text = (body.text ?? "").trim();
  if (!Number.isFinite(eventId) || !text) {
    return NextResponse.json({ error: "missing eventId or text" }, { status: 400 });
  }

  const [evt] = await db.select().from(events).where(eq(events.id, eventId)).limit(1);
  if (!evt) return NextResponse.json({ error: "event not found" }, { status: 404 });

  const roster = await db
    .select({
      id: students.id,
      firstName: students.firstName,
      lastName: students.lastName,
      igHandle: students.igHandle,
    })
    .from(students);

  const rosterCompact = roster
    .map((r) => `${r.id}|${r.firstName}${r.lastName ? " " + r.lastName : ""}${r.igHandle ? " (@" + r.igHandle + ")" : ""}`)
    .join("\n");

  const system = `You parse free-text lists of attendees from a group organizer.
For each attendee in the input:
- If they look like an existing roster entry (fuzzy match first name, last name, or IG handle — be generous with nicknames like Mike/Michael, Jess/Jessica), set match="existing" with that studentId.
- Otherwise match="new". Extract any attributes the organizer mentions parenthetically (year, gender as M/F, IG handle, free-form notes).
- For "bro/brother/guy" infer gender="M". For "sister/girl" infer gender="F". Only set gender if clearly indicated.
- Always include rawText with the exact substring you parsed for that person.
Be conservative: only set fields you have evidence for.`;

  const userMsg = `Existing roster (id|name (@ig)):\n${rosterCompact || "(empty roster)"}\n\nAttendees text:\n${text}`;

  let resp;
  try {
    resp = await anthropic.messages.create({
      model: MODEL,
      max_tokens: 2048,
      system,
      tools: [PARSE_ATTENDANCE_TOOL],
      tool_choice: { type: "tool", name: PARSE_ATTENDANCE_TOOL.name },
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
  const input = toolUse.input as { attendees?: any[] };
  const attendees = (input.attendees ?? []).map((a: any) => {
    if (a.match === "existing" && typeof a.studentId === "number") {
      const r = roster.find((x) => x.id === a.studentId);
      a._existingName = r ? `${r.firstName}${r.lastName ? " " + r.lastName : ""}` : undefined;
    }
    return a;
  });

  return NextResponse.json({ attendees, explanation: `Parsed ${attendees.length} attendee${attendees.length === 1 ? "" : "s"}.` });
}
