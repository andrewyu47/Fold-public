import { NextResponse } from "next/server";
import { anthropic, MODEL, NL_QUERY_TOOL } from "@/lib/claude";
import { runFilter, type FilterSpec } from "@/lib/filter-to-sql";
import { getCurrentUser } from "@/lib/auth";

export async function POST(req: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const { query } = (await req.json()) as { query?: string };
  if (!query?.trim()) return NextResponse.json({ error: "missing query" }, { status: 400 });

  const system = `You translate organizer questions into a structured filter spec.
Vocabulary hints:
- "bros" / "brothers" / "guys" → gender M
- "sisters" / "girls" → gender F
- "core" / "core member" / "committed" → memberStatus ["core"]
- "member" alone → memberStatus ["member", "core"]
- "prospect" / "new member" → memberStatus ["prospect"]
- "active" → isActive true. "inactive" → isActive false. "cold" / "haven't been" → notAttendedSinceDays.
- Year buckets: freshmen, sophomores, juniors, seniors, grads.
- "winter retreat" / "hangout" etc. → attendedEventNameContains with that substring.
Always call query_students. Keep filters minimal — only set what the user asked for.`;

  let resp;
  try {
    resp = await anthropic.messages.create({
      model: MODEL,
      max_tokens: 1024,
      system,
      tools: [NL_QUERY_TOOL],
      tool_choice: { type: "tool", name: NL_QUERY_TOOL.name },
      messages: [{ role: "user", content: query }],
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "claude failed" },
      { status: 502 }
    );
  }

  const tu = resp.content.find((b) => b.type === "tool_use");
  if (!tu || tu.type !== "tool_use") {
    return NextResponse.json({ error: "no tool use" }, { status: 502 });
  }
  const input = tu.input as { filters: FilterSpec; explanation?: string };
  const rows = await runFilter(input.filters ?? {});
  return NextResponse.json({
    rows,
    explanation: input.explanation ?? "",
    filters: input.filters ?? {},
  });
}
