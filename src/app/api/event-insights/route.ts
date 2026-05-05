import { NextResponse } from "next/server";
import { anthropic, EVENT_INSIGHTS_TOOL } from "@/lib/claude";
import { getCurrentUser } from "@/lib/auth";
import type { EventAggregates } from "@/lib/event-features";

const HAIKU = "claude-haiku-4-5-20251001";

export async function POST(req: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  let body: { aggregates?: EventAggregates };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "bad json" }, { status: 400 });
  }
  const agg = body.aggregates;
  if (!agg || typeof agg.totalEvents !== "number") {
    return NextResponse.json({ error: "missing aggregates" }, { status: 400 });
  }
  if (agg.totalEvents < 3) {
    return NextResponse.json({ error: "not enough events for insights" }, { status: 400 });
  }

  const system = `You are a group analytics assistant. The user asks why certain events drew higher attendance and (when present) which events drove organic invites. Given pre-computed aggregates, produce 3-5 punchy hypotheses anchored in the actual numbers.

Rules:
- Cite specific averages and bucket sizes from the data ("avg X with food vs Y without across N vs M events").
- Do not invent factors that aren't present in the aggregates.
- If a bucket size is small (< 3), call out that the signal is weak.
- The "with/without food" and "on/off campus" flags are heuristic regex inferences from event names/locations — caveat that.
- Months are a proxy for "time of school year" since we don't have semester boundaries.
- Be specific about which event(s) at the top of the list might explain a pattern.
- If the \`invite\` block is present, look for invitation-driven attendance patterns: which events had the highest inviteRatio (% of new attendees who were brought by an existing student), and whether food / on-campus / month buckets correlate with higher invite ratios. This signals "events worth inviting friends to" — distinct from raw attendance.
- When invite data is sparse (totalNew < 5 or totalInvitedNew == 0), say so plainly rather than overinterpret.`;

  const userMsg = JSON.stringify(agg, null, 2);

  let resp;
  try {
    resp = await anthropic.messages.create({
      model: HAIKU,
      max_tokens: 600,
      system,
      tools: [EVENT_INSIGHTS_TOOL],
      tool_choice: { type: "tool", name: EVENT_INSIGHTS_TOOL.name },
      messages: [{ role: "user", content: `Aggregates:\n${userMsg}` }],
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
  const out = tu.input as { insights: { headline: string; evidence: string }[] };
  return NextResponse.json({ insights: out.insights ?? [] });
}
