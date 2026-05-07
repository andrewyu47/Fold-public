import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { students } from "../../../../drizzle/schema";
import { anthropic, MODEL, NL_QUERY_TOOL, UPDATE_STUDENTS_TOOL } from "@/lib/claude";
import { runFilter, type FilterSpec } from "@/lib/filter-to-sql";
import { getCurrentUser } from "@/lib/auth";
import { inArray } from "drizzle-orm";

export async function POST(req: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const { text } = (await req.json()) as { text?: string };
  if (!text?.trim()) return NextResponse.json({ error: "missing text" }, { status: 400 });

  const roster = await db
    .select({
      id: students.id,
      firstName: students.firstName,
      lastName: students.lastName,
      igHandle: students.igHandle,
      year: students.year,
      memberStatus: students.memberStatus,
      isActive: students.isActive,
    })
    .from(students);

  const rosterCompact = roster
    .map((r) =>
      `${r.id}|${r.firstName}${r.lastName ? " " + r.lastName : ""}${r.igHandle ? " (@" + r.igHandle + ")" : ""}|${r.year ?? ""}|${r.memberStatus ?? ""}|${r.isActive ? "active" : "inactive"}`
    )
    .join("\n");

  const system = `You are a group management assistant. You handle two types of requests:

1. QUERIES — the user is asking a question about their members ("show me all the guys", "who hasn't shown up in 30 days", "active members who are core"). Use the query_students tool.
2. UPDATES — the user wants to change, add, or remove member data ("mark Kenzie as core", "add Sarah Kim, sophomore", "delete the duplicate entry"). Use the update_students tool.

Decide which tool to use based on the intent. If the user is asking/filtering, use query_students. If the user is modifying/adding/deleting, use update_students.

Query vocabulary:
- "bros" / "brothers" / "guys" → gender M
- "sisters" / "girls" → gender F
- "core" / "core member" / "committed" → memberStatus ["core"]
- "member" alone → ["member", "core"]
- "prospect" / "new" (in status context) → ["prospect"]
- "active" → isActive true. "inactive" → isActive false
- "cold" / "haven't been" → notAttendedSinceDays
- Year buckets: freshmen, sophomores, juniors, seniors, grads

Update rules:
- Match names fuzzily (Mike/Michael, Jess/Jessica), and consider IG handles
- If a first-name is shared by multiple students, add it to "ambiguous" instead of guessing
- "mark X as core" → memberStatus: "core"
- "X is now a junior" → year: "junior"
- "X is inactive" / "X stopped coming" → isActive: false
- "X is in the IG group chat" → contactedViaIg: true
- Contextual observations → use notesAppend, not notes
- To ADD a new person not in the roster, use "creates"
- Be conservative: only set fields explicitly mentioned`;

  const userMsg = `Roster (id|name (@ig)|year|status|active):\n${rosterCompact || "(empty)"}\n\nRequest:\n${text}`;

  let resp;
  try {
    resp = await anthropic.messages.create({
      model: MODEL,
      max_tokens: 2048,
      system,
      tools: [NL_QUERY_TOOL, UPDATE_STUDENTS_TOOL],
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

  if (tu.name === NL_QUERY_TOOL.name) {
    const input = tu.input as { filters: FilterSpec; explanation?: string };
    const rows = await runFilter(input.filters ?? {});
    return NextResponse.json({
      mode: "query",
      rows,
      explanation: input.explanation ?? "",
      filters: input.filters ?? {},
    });
  }

  const out = tu.input as {
    updates: { studentId: number; patch: Record<string, unknown> }[];
    creates?: Record<string, unknown>[];
    deletes?: { studentId: number; reason?: string }[];
    explanation: string;
    ambiguous?: string[];
  };

  const updateIds = (out.updates ?? []).map((u) => u.studentId).filter((n) => Number.isFinite(n));
  const deleteIds = (out.deletes ?? []).map((d) => d.studentId).filter((n) => Number.isFinite(n));
  const allIds = [...new Set([...updateIds, ...deleteIds])];
  const before = allIds.length ? await db.select().from(students).where(inArray(students.id, allIds)) : [];
  const beforeById = new Map(before.map((s) => [s.id, s]));

  const previews = (out.updates ?? []).map((u) => ({
    studentId: u.studentId,
    before: beforeById.get(u.studentId) ?? null,
    patch: u.patch,
  }));
  const deletes = (out.deletes ?? []).map((d) => ({
    studentId: d.studentId,
    student: beforeById.get(d.studentId) ?? null,
    reason: d.reason ?? "",
  }));

  return NextResponse.json({
    mode: "update",
    explanation: out.explanation,
    ambiguous: out.ambiguous ?? [],
    previews,
    creates: out.creates ?? [],
    deletes,
  });
}
