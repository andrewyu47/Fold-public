import { NextResponse } from "next/server";
import { anthropic, EVENT_INSIGHTS_TOOL } from "@/lib/claude";
import { getCurrentUser } from "@/lib/auth";

const HAIKU = "claude-haiku-4-5-20251001";

interface SingleEventStats {
  total: number;
  firstTimers: number;
  returners: number;
  genderSplit: { M: number; F: number; unknown: number };
  inviteChains: { inviter: string; invitees: string[] }[];
}

export async function POST(req: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  let body: { eventId?: number; stats?: SingleEventStats };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "bad json" }, { status: 400 });
  }

  const { eventId, stats } = body;
  if (!eventId || !stats || typeof stats.total !== "number") {
    return NextResponse.json({ error: "missing eventId or stats" }, { status: 400 });
  }
  if (stats.total < 1) {
    return NextResponse.json({ error: "no attendees" }, { status: 400 });
  }

  const system = `You are a group analytics assistant. The user provides attendance stats for a single event. Produce 2-4 punchy observations about the event's attendance breakdown.

Rules:
- Cite specific numbers from the stats (e.g. "3 of 12 attendees were first-timers").
- Comment on the first-timer vs returner ratio and what it might indicate (outreach-heavy vs community-building).
- If gender split is lopsided, note it.
- If invite chains are present, highlight who brought the most people and what that signals about organic growth.
- If invite chains are empty, note that no invitation tracking was recorded.
- Keep observations grounded in the numbers provided. Do not invent data.
- Be concise and actionable.`;

  const userMsg = JSON.stringify(stats, null, 2);

  let resp;
  try {
    resp = await anthropic.messages.create({
      model: HAIKU,
      max_tokens: 400,
      system,
      tools: [EVENT_INSIGHTS_TOOL],
      tool_choice: { type: "tool", name: EVENT_INSIGHTS_TOOL.name },
      messages: [{ role: "user", content: `Single event stats:\n${userMsg}` }],
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "claude failed" },
      { status: 502 }
    );
  }

  const tu = resp.content.find((b) => b.type === "tool_use");
  if (!tu || tu.type !== "tool_use") {
    return NextResponse.json({ error: "no tool use returned" }, { status: 502 });
  }
  const out = tu.input as { insights: { headline: string; evidence: string }[] };
  return NextResponse.json({ insights: out.insights ?? [] });
}
