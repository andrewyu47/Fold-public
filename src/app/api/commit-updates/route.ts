import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { students } from "../../../../drizzle/schema";
import { eq } from "drizzle-orm";
import { getCurrentUser } from "@/lib/auth";

const ALLOWED = new Set([
  "firstName",
  "lastName",
  "gender",
  "year",
  "phone",
  "email",
  "igHandle",
  "isActive",
  "contactedViaIg",
  "primaryContact",
  "goals",
  "notes",
]);

export async function POST(req: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const body = (await req.json()) as {
    updates: { studentId: number; patch: Record<string, unknown>; notesAppend?: string }[];
    deletes?: { studentId: number }[];
  };
  const list = Array.isArray(body.updates) ? body.updates : [];
  const deleteList = Array.isArray(body.deletes) ? body.deletes : [];
  let applied = 0;
  let deleted = 0;

  for (const u of list) {
    if (!Number.isFinite(u.studentId)) continue;
    const patch: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(u.patch ?? {})) {
      if (k === "notesAppend") continue;
      if (!ALLOWED.has(k)) continue;
      if (v === undefined) continue;
      if (k === "igHandle" && typeof v === "string") {
        patch[k] = v.replace(/^@/, "") || null;
      } else if (typeof v === "string" && v === "") {
        patch[k] = null;
      } else {
        patch[k] = v;
      }
    }
    const append = (u.patch?.notesAppend as string | undefined) ?? u.notesAppend;
    if (append && append.trim()) {
      const [cur] = await db
        .select({ notes: students.notes })
        .from(students)
        .where(eq(students.id, u.studentId))
        .limit(1);
      const stamp = new Date().toISOString().slice(0, 10);
      const line = `[${stamp}] ${append.trim()}`;
      patch.notes = cur?.notes ? `${cur.notes}\n${line}` : line;
    }
    if (Object.keys(patch).length === 0) continue;
    patch.updatedAt = new Date();
    await db.update(students).set(patch as any).where(eq(students.id, u.studentId));
    applied += 1;
  }

  for (const d of deleteList) {
    if (!Number.isFinite(d.studentId)) continue;
    await db.delete(students).where(eq(students.id, d.studentId));
    deleted += 1;
  }

  return NextResponse.json({ ok: true, applied, deleted });
}
