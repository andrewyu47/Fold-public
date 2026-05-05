import { cookies } from "next/headers";
import { randomBytes } from "node:crypto";
import bcrypt from "bcryptjs";
import { eq, and, gt } from "drizzle-orm";
import { db } from "./db";
import { users, sessions } from "../../drizzle/schema";

const COOKIE = "fold_session";
const TTL_DAYS = 30;

export async function hashPassword(plain: string) {
  return bcrypt.hash(plain, 10);
}

export async function verifyPassword(plain: string, hash: string) {
  return bcrypt.compare(plain, hash);
}

export async function createSession(userId: number) {
  const id = randomBytes(32).toString("hex");
  const expiresAt = new Date(Date.now() + TTL_DAYS * 24 * 60 * 60 * 1000);
  await db.insert(sessions).values({ id, userId, expiresAt });
  const c = await cookies();
  c.set(COOKIE, id, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    expires: expiresAt,
    path: "/",
  });
  return id;
}

export async function destroySession() {
  const c = await cookies();
  const id = c.get(COOKIE)?.value;
  if (id) {
    await db.delete(sessions).where(eq(sessions.id, id));
  }
  c.delete(COOKIE);
}

export async function getCurrentUser() {
  const c = await cookies();
  const id = c.get(COOKIE)?.value;
  if (!id) return null;
  const rows = await db
    .select({ user: users, session: sessions })
    .from(sessions)
    .innerJoin(users, eq(users.id, sessions.userId))
    .where(and(eq(sessions.id, id), gt(sessions.expiresAt, new Date())))
    .limit(1);
  return rows[0]?.user ?? null;
}

export async function requireUser() {
  const u = await getCurrentUser();
  if (!u) throw new Error("UNAUTHORIZED");
  return u;
}
