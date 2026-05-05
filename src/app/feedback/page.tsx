import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { feedback, users } from "../../../drizzle/schema";
import { desc, eq } from "drizzle-orm";
import { requireUser } from "@/lib/auth";

export const dynamic = "force-dynamic";

export default async function FeedbackPage({
  searchParams,
}: {
  searchParams: Promise<{ ok?: string; page?: string }>;
}) {
  const me = await requireUser();
  const sp = await searchParams;
  const fromPage = sp.page ?? "";

  const recent = await db
    .select({
      id: feedback.id,
      text: feedback.text,
      page: feedback.page,
      createdAt: feedback.createdAt,
      authorName: users.displayName,
      authorEmail: users.email,
      authorId: users.id,
    })
    .from(feedback)
    .leftJoin(users, eq(users.id, feedback.userId))
    .orderBy(desc(feedback.createdAt))
    .limit(50);

  async function submit(formData: FormData) {
    "use server";
    const text = String(formData.get("text") || "").trim();
    const page = String(formData.get("page") || "").trim() || null;
    if (!text) redirect("/feedback");
    await db.insert(feedback).values({ text, page, userId: me.id });
    redirect("/feedback?ok=1");
  }

  async function del(formData: FormData) {
    "use server";
    const id = Number(formData.get("id"));
    if (!Number.isFinite(id)) return;
    const [row] = await db.select().from(feedback).where(eq(feedback.id, id)).limit(1);
    if (row && row.userId === me.id) {
      await db.delete(feedback).where(eq(feedback.id, id));
    }
    redirect("/feedback");
  }

  return (
    <div className="max-w-3xl mx-auto px-4 py-8 space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Questions & feedback</h1>
        <p className="text-sm text-black/60">
          Spotted a bug? Idea for a feature? Confusing flow? Drop a note. Other leaders can see these too.
        </p>
      </div>

      <form action={submit} className="card space-y-3">
        <div>
          <label className="label" htmlFor="text">Your note</label>
          <textarea
            id="text"
            name="text"
            rows={4}
            required
            className="input"
            placeholder="What's broken, missing, or confusing? What would help you?"
          />
        </div>
        <div>
          <label className="label" htmlFor="page">Which page (optional)</label>
          <input
            id="page"
            name="page"
            className="input"
            defaultValue={fromPage}
            placeholder="e.g. /events/12, /modify, dashboard"
          />
        </div>
        <div className="flex items-center justify-between">
          {sp.ok === "1" ? (
            <span className="text-sm text-emerald-600">✓ Sent. Thanks!</span>
          ) : (
            <span />
          )}
          <button className="btn-primary" type="submit">Send</button>
        </div>
      </form>

      <section className="space-y-3">
        <h2 className="font-semibold">Recent ({recent.length})</h2>
        {recent.length === 0 ? (
          <p className="text-sm text-black/50">No feedback yet. Be the first.</p>
        ) : (
          <ul className="space-y-2">
            {recent.map((r) => (
              <li key={r.id} className="card">
                <div className="flex items-baseline justify-between gap-3">
                  <div className="text-sm">
                    <span className="font-medium">{r.authorName ?? "(deleted user)"}</span>
                    {r.page && <span className="ml-2 chip">{r.page}</span>}
                  </div>
                  <div className="flex items-center gap-2">
                    <time className="text-xs text-black/50">
                      {new Date(r.createdAt).toLocaleString()}
                    </time>
                    {r.authorId === me.id && (
                      <form action={del}>
                        <input type="hidden" name="id" value={r.id} />
                        <button type="submit" className="text-xs text-black/40 hover:text-red-600">delete</button>
                      </form>
                    )}
                  </div>
                </div>
                <p className="mt-2 text-sm whitespace-pre-wrap">{r.text}</p>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
