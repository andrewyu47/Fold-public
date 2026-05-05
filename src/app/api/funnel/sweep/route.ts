import { NextResponse } from "next/server";
import { timingSafeEqual } from "node:crypto";
import { getCurrentUser } from "@/lib/auth";
import { markInactiveStudents, type SweepTrigger } from "@/lib/funnel/auto-dormant";

function tokenMatches(provided: string | null): boolean {
  const expected = process.env.FUNNEL_SWEEP_TOKEN;
  if (!expected || !provided) return false;
  const a = Buffer.from(provided);
  const b = Buffer.from(expected);
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

function extractToken(req: Request): string | null {
  const auth = req.headers.get("authorization");
  if (auth) {
    const m = auth.match(/^Bearer\s+(.+)$/i);
    if (m) return m[1].trim();
  }
  const url = new URL(req.url);
  const q = url.searchParams.get("token");
  if (q) return q;
  return null;
}

interface AuthResult {
  ok: boolean;
  trigger: SweepTrigger;
}

async function authorize(req: Request): Promise<AuthResult> {
  if (tokenMatches(extractToken(req))) return { ok: true, trigger: "scheduled" };
  const user = await getCurrentUser();
  return { ok: !!user, trigger: "manual" };
}

async function runSweep(req: Request, trigger: SweepTrigger) {
  let thresholdDays = 21;
  try {
    const body = (await req.clone().json()) as { thresholdDays?: number };
    if (typeof body.thresholdDays === "number" && body.thresholdDays >= 1) {
      thresholdDays = Math.floor(body.thresholdDays);
    }
  } catch {
    // body is optional
  }
  const url = new URL(req.url);
  const qDays = url.searchParams.get("thresholdDays");
  if (qDays && Number.isFinite(Number(qDays)) && Number(qDays) >= 1) {
    thresholdDays = Math.floor(Number(qDays));
  }
  const out = await markInactiveStudents(thresholdDays, trigger);
  return NextResponse.json({ ok: true, thresholdDays, trigger, ...out });
}

export async function POST(req: Request) {
  const auth = await authorize(req);
  if (!auth.ok) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  return runSweep(req, auth.trigger);
}

// Also accept GET so a simple cron / fetch can call it without a body.
export async function GET(req: Request) {
  const auth = await authorize(req);
  if (!auth.ok) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  return runSweep(req, auth.trigger);
}
