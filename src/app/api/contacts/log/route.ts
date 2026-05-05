import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { students, contactAttempts } from "../../../../../drizzle/schema";
import { eq } from "drizzle-orm";
import { getCurrentUser } from "@/lib/auth";
import type { Channel, FunnelStage } from "@/lib/funnel/types";

const CHANNELS: Channel[] = ["ig_dm", "text", "phone", "email", "in_person", "other"];

interface Body {
  studentId?: number;
  channel?: Channel;
  channelDetail?: string;
  responded?: boolean;
  notes?: string;
}

export async function POST(req: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const body = (await req.json()) as Body;
  const sid = Number(body.studentId);
  const channel = body.channel as Channel;
  if (!Number.isFinite(sid) || !CHANNELS.includes(channel)) {
    return NextResponse.json({ error: "missing/invalid studentId or channel" }, { status: 400 });
  }

  const [s] = await db.select().from(students).where(eq(students.id, sid)).limit(1);
  if (!s) return NextResponse.json({ error: "student not found" }, { status: 404 });

  const responded = !!body.responded;
  await db.insert(contactAttempts).values({
    studentId: sid,
    attemptedByUserId: user.id,
    channel,
    channelDetail: body.channelDetail ?? null,
    responded,
    notes: body.notes ?? null,
  });

  // Bump stage forward only.
  const order: FunnelStage[] = [
    "new",
    "reaching_out",
    "connected",
    "met",
    "active",
    "engaged",
  ];
  const target: FunnelStage = responded ? "connected" : "reaching_out";
  const currentIdx = s.funnelStage === "inactive" ? 1 : order.indexOf(s.funnelStage as FunnelStage);
  const targetIdx = order.indexOf(target);
  if (targetIdx > currentIdx || (s.funnelStage === "inactive")) {
    await db
      .update(students)
      .set({ funnelStage: target, updatedAt: new Date() })
      .where(eq(students.id, sid));
  }

  return NextResponse.json({ ok: true });
}
