import { db } from "@/lib/db";
import { students, contactAttempts, attendances, funnelSweepLog } from "../../../drizzle/schema";
import { and, eq, gte, inArray, sql } from "drizzle-orm";
import type { FunnelStage } from "./types";

const STAGES_ELIGIBLE_FOR_INACTIVE: FunnelStage[] = ["connected", "met", "active"];

export type SweepTrigger = "manual" | "scheduled";

export interface DormantSweepResult {
  flipped: { studentId: number; from: string }[];
  evaluated: number;
  logId: number;
}

export async function markInactiveStudents(
  thresholdDays = 21,
  triggeredBy: SweepTrigger = "manual",
  now = new Date()
): Promise<DormantSweepResult> {
  const cutoff = new Date(now.getTime() - thresholdDays * 24 * 60 * 60 * 1000);

  const eligible = await db
    .select({ id: students.id, stage: students.funnelStage })
    .from(students)
    .where(inArray(students.funnelStage, STAGES_ELIGIBLE_FOR_INACTIVE));

  const flipped: { studentId: number; from: string }[] = [];
  for (const s of eligible) {
    const [{ recent }] = await db
      .select({ recent: sql<number>`count(*)` })
      .from(contactAttempts)
      .where(
        and(eq(contactAttempts.studentId, s.id), gte(contactAttempts.attemptedAt, cutoff))
      );
    if (recent > 0) continue;

    const [{ recentAttended }] = await db
      .select({ recentAttended: sql<number>`count(*)` })
      .from(attendances)
      .where(
        and(eq(attendances.studentId, s.id), gte(attendances.recordedAt, cutoff))
      );
    if (recentAttended > 0) continue;

    await db
      .update(students)
      .set({ funnelStage: "inactive", updatedAt: now })
      .where(eq(students.id, s.id));
    flipped.push({ studentId: s.id, from: s.stage });
  }

  const [logRow] = await db
    .insert(funnelSweepLog)
    .values({
      runAt: now,
      thresholdDays,
      evaluated: eligible.length,
      flippedCount: flipped.length,
      flipped,
      triggeredBy,
    })
    .returning({ id: funnelSweepLog.id });

  return { flipped, evaluated: eligible.length, logId: logRow.id };
}
