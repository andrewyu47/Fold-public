import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { students } from "../../../../../../drizzle/schema";
import { eq } from "drizzle-orm";
import { getCurrentUser } from "@/lib/auth";
import type { FunnelStage } from "@/lib/funnel/types";

const STAGES: FunnelStage[] = [
  "new",
  "reaching_out",
  "connected",
  "met",
  "active",
  "engaged",
  "inactive",
];

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const { id } = await params;
  const sid = Number(id);
  if (!Number.isFinite(sid)) return NextResponse.json({ error: "bad id" }, { status: 400 });

  const body = (await req.json()) as { stage?: FunnelStage };
  if (!body.stage || !STAGES.includes(body.stage)) {
    return NextResponse.json({ error: "invalid stage" }, { status: 400 });
  }

  await db
    .update(students)
    .set({ funnelStage: body.stage, updatedAt: new Date() })
    .where(eq(students.id, sid));

  return NextResponse.json({ ok: true });
}
