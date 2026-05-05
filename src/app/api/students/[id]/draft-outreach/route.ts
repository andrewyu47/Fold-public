import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import {
  students,
  contactAttempts,
  attendances,
  events,
  users,
} from "../../../../../../drizzle/schema";
import { eq, desc } from "drizzle-orm";
import { anthropic, MODEL } from "@/lib/claude";
import { DRAFT_OUTREACH_TOOL } from "@/lib/funnel/draft-tools";
import { getCurrentUser } from "@/lib/auth";
import type { Channel } from "@/lib/funnel/types";

const CHANNELS: Channel[] = ["ig_dm", "text", "phone", "email", "in_person", "other"];
const CHANNEL_HINT: Record<Channel, string> = {
  ig_dm: "Instagram DM. 1-3 sentences. Casual, lowercase ok, no formal salutation. Emojis sparingly if at all.",
  text: "SMS. 1-3 sentences. Casual but punctuated. No emojis unless the organizer has used them with this person before.",
  phone: "Phone call opener — what to actually say in the first 15 seconds. 2-3 lines.",
  email: "Email. 2-4 short paragraphs max. Subject line on its own first line as 'Subject: ...'. Sign off with the organizer's name.",
  in_person: "What to say when you walk up to them. 1-2 sentences, plus a question.",
  other: "Generic short message. 1-3 sentences.",
};

interface Body {
  channel?: Channel;
  purpose?: string;
  refinement?: string;
}

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const { id } = await params;
  const sid = Number(id);
  if (!Number.isFinite(sid)) return NextResponse.json({ error: "bad id" }, { status: 400 });

  let body: Body = {};
  try {
    body = (await req.json()) as Body;
  } catch {
    return NextResponse.json({ error: "bad json" }, { status: 400 });
  }
  const channel: Channel = CHANNELS.includes(body.channel as Channel)
    ? (body.channel as Channel)
    : "ig_dm";
  const purpose = (body.purpose ?? "").trim();
  const refinement = (body.refinement ?? "").trim();

  const [s] = await db.select().from(students).where(eq(students.id, sid)).limit(1);
  if (!s) return NextResponse.json({ error: "student not found" }, { status: 404 });

  const recentAttempts = await db
    .select({
      channel: contactAttempts.channel,
      channelDetail: contactAttempts.channelDetail,
      attemptedAt: contactAttempts.attemptedAt,
      responded: contactAttempts.responded,
      notes: contactAttempts.notes,
      byName: users.displayName,
    })
    .from(contactAttempts)
    .leftJoin(users, eq(users.id, contactAttempts.attemptedByUserId))
    .where(eq(contactAttempts.studentId, sid))
    .orderBy(desc(contactAttempts.attemptedAt))
    .limit(8);

  const recentEvents = await db
    .select({ name: events.name, startDate: events.startDate, recordedAt: attendances.recordedAt })
    .from(attendances)
    .innerJoin(events, eq(events.id, attendances.eventId))
    .where(eq(attendances.studentId, sid))
    .orderBy(desc(attendances.recordedAt))
    .limit(5);

  const profileLines: string[] = [];
  profileLines.push(`Name: ${s.firstName}${s.lastName ? " " + s.lastName : ""}`);
  if (s.gender) profileLines.push(`Gender: ${s.gender === "M" ? "male" : "female"}`);
  if (s.year) profileLines.push(`Year: ${s.year}`);
  if (s.igHandle) profileLines.push(`IG: @${s.igHandle}`);
  if (s.funnelStage) profileLines.push(`Funnel stage: ${s.funnelStage}`);
  if (s.firstMetContext) profileLines.push(`First met: ${s.firstMetContext}`);
  if (s.primaryContact) profileLines.push(`Primary contact (leader): ${s.primaryContact}`);
  if (s.goals) profileLines.push(`Goals: ${s.goals}`);
  if (Array.isArray(s.courseMaterial) && s.courseMaterial.length) {
    profileLines.push(`Course material done: ${s.courseMaterial.join(", ")}`);
  }
  if (s.notes) profileLines.push(`Notes: ${s.notes}`);

  const attemptsLines = recentAttempts.map((a) => {
    const when = new Date(a.attemptedAt).toISOString().slice(0, 10);
    const reply = a.responded ? "responded" : "no reply";
    const detail = a.channelDetail ? ` — ${a.channelDetail}` : "";
    const note = a.notes ? ` — ${a.notes}` : "";
    return `  ${when}  ${a.channel}  by ${a.byName ?? "?"}  (${reply})${detail}${note}`;
  });

  const eventLines = recentEvents.map((e) => {
    const when = new Date(e.startDate).toISOString().slice(0, 10);
    return `  ${when}  ${e.name}`;
  });

  const purposeBlock = purpose
    ? `\nLeader's purpose for this message:\n${purpose}\n`
    : "\nNo specific purpose given — write a general warm follow-up.\n";
  const refinementBlock = refinement
    ? `\nRefinement on a previous draft (apply this):\n${refinement}\n`
    : "";

  const system = `You are helping a group organizer draft a short, personal message to a member. The organizer is named "${user.displayName}".

You will get the member's profile, recent contact attempts, and recent event attendance. Write 2-3 distinct drafts the organizer can choose from.

Voice: warm, specific, not generic. Like the organizer actually knows the person. Avoid em-dashes. Avoid "Hope you're doing well" filler.

${CHANNEL_HINT[channel]}

NEVER invent facts (don't claim "we talked about X" if X isn't in the record). If the record is sparse, lean on what IS there (year, where they were first met, last event they attended) or write a soft check-in. End most drafts with a question or a specific ask.

If the organizer's purpose mentions a specific event/place/time, include it in the drafts. If a refinement is given, ALL drafts should reflect it.`;

  const userMsg = `Channel: ${channel}

Student profile:
${profileLines.join("\n")}

Recent contact attempts (most recent first, up to 8):
${attemptsLines.length ? attemptsLines.join("\n") : "  (none yet)"}

Recent event attendance (most recent first, up to 5):
${eventLines.length ? eventLines.join("\n") : "  (none yet)"}
${purposeBlock}${refinementBlock}`;

  let resp;
  try {
    resp = await anthropic.messages.create({
      model: MODEL,
      max_tokens: 1024,
      system,
      tools: [DRAFT_OUTREACH_TOOL],
      tool_choice: { type: "tool", name: DRAFT_OUTREACH_TOOL.name },
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

  const input = toolUse.input as {
    drafts?: Array<{ label: string; body: string }>;
    explanation?: string;
  };

  return NextResponse.json({
    drafts: input.drafts ?? [],
    explanation: input.explanation ?? "",
    channel,
  });
}
