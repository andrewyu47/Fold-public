import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { students, contactAttempts } from "../../../../../drizzle/schema";
import { eq } from "drizzle-orm";
import { getCurrentUser } from "@/lib/auth";
import type { ParsedContact, FunnelStage } from "@/lib/funnel/types";

interface Body {
  contacts?: ParsedContact[];
}

function bumpStage(current: FunnelStage, attempted: boolean, responded: boolean): FunnelStage {
  // Move forward only — never backward.
  const order: FunnelStage[] = [
    "new",
    "reaching_out",
    "connected",
    "met",
    "active",
    "engaged",
  ];
  let target: FunnelStage = current;
  if (attempted) target = "reaching_out";
  if (responded) target = "connected";
  // inactive → reaching_out on any new touch
  const currentIdx = current === "inactive" ? 1 : order.indexOf(current);
  const targetIdx = order.indexOf(target);
  if (targetIdx > currentIdx) return target;
  return current === "inactive" && (attempted || responded) ? target : current;
}

export async function POST(req: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const body = (await req.json()) as Body;
  const list = Array.isArray(body.contacts) ? body.contacts : [];

  let created = 0;
  let attemptsLogged = 0;
  let stageChanges = 0;

  for (const c of list) {
    let sid: number | undefined;
    if (c.match === "existing" && typeof c.studentId === "number") {
      sid = c.studentId;
    } else if (c.match === "new" && c.firstName) {
      const [row] = await db
        .insert(students)
        .values({
          firstName: c.firstName,
          lastName: c.lastName ?? null,
          gender: c.gender ?? null,
          year: (c.year as never) ?? null,
          igHandle: c.igHandle ?? null,
          phone: c.phone ?? null,
          email: c.email ?? null,
          notes: c.notes ?? null,
          addedByUserId: user.id,
          firstMetContext: c.firstMetContext ?? null,
          firstMetAt: new Date(),
          funnelStage: "new",
        })
        .returning();
      sid = row.id;
      created += 1;
    }
    if (!sid) continue;

    const attempted = !!c.attemptedChannel;
    const responded = !!c.responded;

    if (attempted) {
      await db.insert(contactAttempts).values({
        studentId: sid,
        attemptedByUserId: user.id,
        channel: c.attemptedChannel!,
        channelDetail: c.attemptedChannelDetail ?? null,
        responded,
        notes: c.notes ?? null,
      });
      attemptsLogged += 1;
    }

    if (attempted) {
      const [s] = await db.select().from(students).where(eq(students.id, sid)).limit(1);
      if (s) {
        const next = bumpStage(s.funnelStage as FunnelStage, attempted, responded);
        if (next !== s.funnelStage) {
          await db
            .update(students)
            .set({ funnelStage: next, updatedAt: new Date() })
            .where(eq(students.id, sid));
          stageChanges += 1;
        }
      }
    }
  }

  return NextResponse.json({ ok: true, created, attemptsLogged, stageChanges });
}
