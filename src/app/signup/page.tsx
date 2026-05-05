import Link from "next/link";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { users } from "../../../drizzle/schema";
import { eq } from "drizzle-orm";
import { hashPassword, createSession, getCurrentUser } from "@/lib/auth";

export default async function SignupPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const u = await getCurrentUser();
  if (u) redirect("/");
  const sp = await searchParams;

  async function signup(formData: FormData) {
    "use server";
    const email = String(formData.get("email") || "").trim().toLowerCase();
    const displayName = String(formData.get("displayName") || "").trim();
    const password = String(formData.get("password") || "");

    if (!email || !displayName || !password) redirect("/signup?error=missing");
    if (!email.includes("@") || email.length < 5) redirect("/signup?error=email");
    const ALLOWED_DOMAIN = process.env.ALLOWED_DOMAIN;
    if (ALLOWED_DOMAIN && email.split("@")[1] !== ALLOWED_DOMAIN) redirect("/signup?error=domain");
    if (password.length < 8) redirect("/signup?error=short");

    const [existing] = await db.select().from(users).where(eq(users.email, email)).limit(1);
    if (existing) redirect("/signup?error=taken");

    const hash = await hashPassword(password);
    const [row] = await db
      .insert(users)
      .values({ email, displayName, passwordHash: hash })
      .returning();
    await createSession(row.id);
    redirect("/");
  }

  const errorMsg =
    sp.error === "missing" ? "Please fill all fields."
    : sp.error === "email" ? "That doesn't look like a valid email."
    : sp.error === "domain" ? `Only @${process.env.ALLOWED_DOMAIN} emails can sign up.`
    : sp.error === "short" ? "Password must be at least 8 characters."
    : sp.error === "taken" ? "An account already exists for that email — try signing in instead."
    : "";

  return (
    <div className="min-h-screen flex items-center justify-center px-4">
      <form action={signup} className="card w-full max-w-sm space-y-4">
        <div>
          <div className="text-2xl font-semibold tracking-tight">✶ Fold</div>
          <div className="text-sm text-black/60 dark:text-white/60">Create your account.</div>
        </div>
        {errorMsg && <div className="text-sm text-red-600">{errorMsg}</div>}
        <div className="space-y-1">
          <label className="label" htmlFor="displayName">Your name</label>
          <input id="displayName" name="displayName" required className="input" placeholder="e.g. Alex Rivera" />
        </div>
        <div className="space-y-1">
          <label className="label" htmlFor="email">Email</label>
          <input id="email" name="email" type="email" autoComplete="email" required className="input" />
        </div>
        <div className="space-y-1">
          <label className="label" htmlFor="password">Password</label>
          <input id="password" name="password" type="password" autoComplete="new-password" required minLength={8} className="input" />
          <p className="text-xs text-black/50">8+ characters.</p>
        </div>
        <button className="btn-primary w-full" type="submit">Create account</button>
        <p className="text-xs text-black/50 dark:text-white/40 text-center">
          Already have an account? <Link href="/login" className="underline">Sign in</Link>
        </p>
      </form>
    </div>
  );
}
