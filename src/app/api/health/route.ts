import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { users } from "../../../../drizzle/schema";
import { sql } from "drizzle-orm";

export async function GET() {
  try {
    const result = await db.select({ c: sql<number>`count(*)` }).from(users);
    return NextResponse.json({
      ok: true,
      userCount: result[0]?.c,
      dbUrl: process.env.TURSO_DATABASE_URL?.slice(0, 40),
      hasToken: !!process.env.TURSO_AUTH_TOKEN,
    });
  } catch (e: any) {
    return NextResponse.json({
      ok: false,
      error: e?.message,
      code: e?.code,
      name: e?.name,
      dbUrl: process.env.TURSO_DATABASE_URL?.slice(0, 40),
      hasToken: !!process.env.TURSO_AUTH_TOKEN,
    }, { status: 500 });
  }
}
