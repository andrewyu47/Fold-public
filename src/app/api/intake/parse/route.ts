import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { students, users } from "../../../../../drizzle/schema";
import { eq } from "drizzle-orm";
import { anthropic, MODEL } from "@/lib/claude";
import { getCurrentUser } from "@/lib/auth";
import { PARSE_INTAKE_TOOL } from "@/lib/funnel/claude-tools";
import { findPossibleDuplicates } from "@/lib/funnel/dedup";
import type { IntakePreview, ParsedContact, DedupCandidateWithName } from "@/lib/funnel/types";

interface ToolInput {
  contacts?: Array<{
    match: "existing" | "new";
    studentId?: number;
    firstName?: string;
    lastName?: string;
    gender?: "M" | "F";
    year?: string;
    igHandle?: string;
    phone?: string;
    email?: string;
    firstMetContext?: string;
    attemptedChannel?: ParsedContact["attemptedChannel"];
    attemptedChannelDetail?: string;
    responded?: boolean;
    notes?: string;
    rawText: string;
  }>;
  explanation?: string;
  ambiguous?: string[];
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
  if (!text) return NextResponse.json({ error: "missing text" }, { status: 400 });

  const roster = await db
    .select({
      id: students.id,
      firstName: students.firstName,
      lastName: students.lastName,
      gender: students.gender,
      year: students.year,
      igHandle: students.igHandle,
      phone: students.phone,
      email: students.email,
      createdAt: students.createdAt,
      addedByUserId: students.addedByUserId,
    })
    .from(students);

  const allUsers = await db.select({ id: users.id, displayName: users.displayName }).from(users);
  const userById = new Map(allUsers.map((u) => [u.id, u.displayName]));

  const rosterCompact = roster
    .map((r) => {
      const tags = [];
      if (r.gender) tags.push(r.gender);
      if (r.year) tags.push(r.year);
      if (r.igHandle) tags.push(`@${r.igHandle}`);
      const tail = tags.length ? ` [${tags.join(", ")}]` : "";
      return `${r.id}|${r.firstName}${r.lastName ? " " + r.lastName : ""}${tail}`;
    })
    .join("\n");

  const system = `You parse a free-text dump from a group organizer who just met or contacted some people.

For each person mentioned:
- If they look like an existing roster entry (fuzzy match first/last name; nicknames Mike/Michael, Jess/Jessica; IG handle), set match="existing" with studentId.
- Otherwise match="new". Extract attributes the organizer mentions parenthetically.
- "bro/brother/guy" → gender="M". "sister/girl" → gender="F". Only if clearly indicated.

ALSO capture:
- firstMetContext: where/how they met, in the organizer's own words. e.g. "the booth", "BBQ at the park", "dorm visit on 5th floor". Pull this from the input verbatim if you can.
- attemptedChannel + attemptedChannelDetail: if the organizer described a contact attempt. "I IG'd Mike" → ig_dm. "texted her" → text. "called him" → phone. "met at the booth" → in_person. Skip if no channel mentioned.
- responded: only set if the organizer explicitly said "she replied" / "no answer" / "didn't respond" / "she said yes". Omit otherwise.

If a name matches 0 or 2+ roster entries, list it under ambiguous.

Always include rawText with the exact substring you parsed for that contact.`;

  const userMsg = `Existing roster (id|name [tags]):\n${rosterCompact || "(empty roster)"}\n\nLeader's input:\n${text}`;

  let resp;
  try {
    resp = await anthropic.messages.create({
      model: MODEL,
      max_tokens: 2048,
      system,
      tools: [PARSE_INTAKE_TOOL],
      tool_choice: { type: "tool", name: PARSE_INTAKE_TOOL.name },
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
  const now = new Date();

  const contacts: ParsedContact[] = (input.contacts ?? []).map((c, i) => {
    const base: ParsedContact = {
      ...c,
      contactId: `row:${i}`,
      serverDedupCandidates: [],
    };

    if (c.match === "existing" && typeof c.studentId === "number") {
      const r = rosterById.get(c.studentId);
      if (r) base.existingDisplayName = `${r.firstName}${r.lastName ? " " + r.lastName : ""}`;
      return base;
    }

    // For new contacts, run server dedup.
    const candidates = findPossibleDuplicates(
      {
        firstName: c.firstName ?? "",
        lastName: c.lastName,
        igHandle: c.igHandle,
        phone: c.phone,
        email: c.email,
      },
      roster,
      now
    );
    const enriched: DedupCandidateWithName[] = candidates.slice(0, 5).map((cand) => {
      const r = rosterById.get(cand.studentId)!;
      return {
        ...cand,
        displayName: `${r.firstName}${r.lastName ? " " + r.lastName : ""}`,
        addedByDisplayName: r.addedByUserId ? userById.get(r.addedByUserId) : undefined,
        createdAt: new Date(r.createdAt).toISOString(),
      };
    });
    base.serverDedupCandidates = enriched;
    return base;
  });

  const preview: IntakePreview = {
    contacts,
    ambiguous: input.ambiguous ?? [],
    explanation: input.explanation ?? `Parsed ${contacts.length} contact${contacts.length === 1 ? "" : "s"}.`,
  };

  return NextResponse.json(preview);
}
