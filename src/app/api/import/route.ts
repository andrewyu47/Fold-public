import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { students } from "../../../../drizzle/schema";
import { eq, and, sql } from "drizzle-orm";
import { parseCsv, autoMap, coerce, SCHEMA_FIELDS, type SchemaField } from "@/lib/csv";
import { getCurrentUser } from "@/lib/auth";

export async function POST(req: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const body = (await req.json()) as {
    csv?: string;
    mode?: "preview" | "commit";
    mapping?: SchemaField[];
  };
  const csv = body.csv ?? "";
  if (!csv.trim()) return NextResponse.json({ error: "missing csv" }, { status: 400 });

  const rows = parseCsv(csv);
  if (rows.length < 2) return NextResponse.json({ error: "csv has no data rows" }, { status: 400 });

  const headers = rows[0].map((h) => h.trim());
  const dataRows = rows.slice(1);
  const mapping = body.mapping ?? autoMap(headers);

  if (body.mode === "preview") {
    return NextResponse.json({
      headers,
      sample: dataRows.slice(0, 5),
      totalRows: dataRows.length,
      mapping,
    });
  }

  // Validate mapping length
  if (mapping.length !== headers.length) {
    return NextResponse.json({ error: "mapping length mismatch" }, { status: 400 });
  }
  if (!mapping.includes("firstName")) {
    return NextResponse.json({ error: "firstName is required in mapping" }, { status: 400 });
  }

  let created = 0;
  let updated = 0;

  for (const row of dataRows) {
    const data: Record<string, unknown> = {};
    for (let i = 0; i < headers.length; i++) {
      const f = mapping[i];
      if (f === "skip" || !SCHEMA_FIELDS.includes(f as any)) continue;
      const val = coerce(f, row[i] ?? "");
      if (val !== null && val !== undefined && val !== "") data[f] = val;
    }
    if (!data.firstName) continue;

    // Dedupe: by email if present, else by first+last
    let existing: { id: number } | undefined;
    if (data.email) {
      const r = await db.select({ id: students.id }).from(students).where(eq(students.email, String(data.email))).limit(1);
      existing = r[0];
    }
    if (!existing && data.lastName) {
      const r = await db
        .select({ id: students.id })
        .from(students)
        .where(
          and(
            sql`lower(first_name) = ${String(data.firstName).toLowerCase()}`,
            sql`lower(coalesce(last_name, '')) = ${String(data.lastName).toLowerCase()}`
          )
        )
        .limit(1);
      existing = r[0];
    }

    if (existing) {
      await db.update(students).set({ ...data, updatedAt: new Date() } as any).where(eq(students.id, existing.id));
      updated += 1;
    } else {
      await db.insert(students).values(data as any);
      created += 1;
    }
  }

  return NextResponse.json({ ok: true, created, updated });
}
