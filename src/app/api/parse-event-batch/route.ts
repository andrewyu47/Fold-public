import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { students } from "../../../../drizzle/schema";
import {
  anthropic,
  MODEL,
  PROPOSE_EVENT_BATCH_TOOL,
  PROPOSE_EVENT_BATCH_LIST_TOOL,
} from "@/lib/claude";
import { getCurrentUser } from "@/lib/auth";

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
  if (!text) return NextResponse.json({ error: "missing text" }, { status: 400 });

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

  const today = new Date().toISOString().slice(0, 10);
  const system = `Today is ${today}. You parse instructions from a group organizer for the QuickAdd dashboard.

You must call EXACTLY ONE of these tools:

1. \`propose_event_with_attendees\` — when the organizer is creating ONE event and listing attendees ("add Alex, Jordan, Sam to new Weekly 5/1 at Community Center"). Use this whenever attendees are mentioned.

2. \`propose_event_batch_list\` — when the organizer wants to create MULTIPLE events in one shot WITHOUT attendees ("create the next 4 Weekly: 5/1 5/8 5/15 5/22", "add Hangout Saturday 3pm and Study Group Tuesday 7pm"). Two or more events, no attendee names.

Common rules for both:
- Dates: ISO YYYY-MM-DD. "5/1" → use current year. "next Friday" → resolve from today.
- Event types: Weekly, Social, General, Workshop, Hangout, Study Group — infer from name.
- A location stated once at the top of the input applies to ALL events in a batch unless overridden per-event.

For propose_event_with_attendees only:
- Set event.isNew=true when the organizer said "new" or wants a fresh event.
- Match attendees against the roster fuzzily (Mike/Michael, Jess/Jessica, IG handles). New people get match="new" with whatever attributes are mentioned (year, gender, IG, notes).
- "bro/brother/guy" → gender M. "sister/girl" → gender F.
- INVITATION: when the organizer says "X brought by Y", "X (Y's friend)", "Y brought X", "X came with Y", or "Y invited X" — set invitedByName=Y on X's row using the inviter's name verbatim. The server will fuzzy-match it against the roster. Do NOT set invitedByName if the inviter relationship is not stated.
- Always include rawText (exact substring) per attendee.
- If no attendees mentioned, return attendees: [].

Be conservative: only set fields you have evidence for.`;

  const userMsg = `Existing roster (id|name (@ig)):\n${rosterCompact || "(empty roster)"}\n\nInstruction:\n${text}`;

  let resp;
  try {
    resp = await anthropic.messages.create({
      model: MODEL,
      max_tokens: 2048,
      system,
      tools: [PROPOSE_EVENT_BATCH_TOOL, PROPOSE_EVENT_BATCH_LIST_TOOL],
      tool_choice: { type: "any" },
      messages: [{ role: "user", content: userMsg }],
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "claude failed" },
      { status: 502 }
    );
  }

  const tu = resp.content.find((b) => b.type === "tool_use");
  if (!tu || tu.type !== "tool_use") {
    return NextResponse.json({ error: "claude returned no tool use" }, { status: 502 });
  }

  if (tu.name === PROPOSE_EVENT_BATCH_LIST_TOOL.name) {
    const out = tu.input as { events?: Array<{ name: string; date: string; type?: string; location?: string }> };
    const events = (out.events ?? []).filter((e) => e.name?.trim() && e.date);
    return NextResponse.json({ mode: "batch", events });
  }

  // Default: single event with attendees.
  const out = tu.input as { event: unknown; attendees?: Array<Record<string, unknown>> };

  const resolveInviter = (raw: unknown): { id: number; name: string } | null => {
    if (typeof raw !== "string") return null;
    const q = raw.trim().toLowerCase();
    if (!q) return null;
    // Strip leading @ if leader passed an IG handle.
    const igq = q.replace(/^@/, "");
    let best: { score: number; row: typeof roster[number] } | null = null;
    for (const r of roster) {
      const full = `${r.firstName}${r.lastName ? " " + r.lastName : ""}`.toLowerCase();
      const first = r.firstName.toLowerCase();
      const ig = (r.igHandle ?? "").toLowerCase();
      let score = 0;
      if (full === q) score = 100;
      else if (ig && ig === igq) score = 95;
      else if (first === q) score = 80;
      else if (full.startsWith(q) && q.length >= 3) score = 70;
      else if (first.startsWith(q) && q.length >= 3) score = 60;
      if (score > 0 && (!best || score > best.score)) best = { score, row: r };
    }
    if (!best) return null;
    return {
      id: best.row.id,
      name: `${best.row.firstName}${best.row.lastName ? " " + best.row.lastName : ""}`,
    };
  };

  const attendees = (out.attendees ?? []).map((a) => {
    if (a.match === "existing" && typeof a.studentId === "number") {
      const r = roster.find((x) => x.id === a.studentId);
      (a as Record<string, unknown>)._existingName = r
        ? `${r.firstName}${r.lastName ? " " + r.lastName : ""}`
        : undefined;
    }
    if (typeof a.invitedByName === "string" && a.invitedByName.trim()) {
      const resolved = resolveInviter(a.invitedByName);
      if (resolved) {
        (a as Record<string, unknown>).invitedById = resolved.id;
        (a as Record<string, unknown>)._invitedByDisplayName = resolved.name;
      }
    }
    return a;
  });

  return NextResponse.json({ mode: "single", event: out.event, attendees });
}
