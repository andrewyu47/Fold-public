"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";

type Patch = Record<string, unknown> & { notesAppend?: string };
type Preview = {
  studentId: number;
  before: Record<string, any> | null;
  patch: Patch;
};
type DeletePreview = {
  studentId: number;
  student: Record<string, any> | null;
  reason: string;
};

const FIELD_LABEL: Record<string, string> = {
  firstName: "First name",
  lastName: "Last name",
  gender: "Gender",
  year: "Year",
  phone: "Phone",
  email: "Email",
  igHandle: "IG handle",
  isActive: "Active",
  contactedViaIg: "In IG groupchat",
  primaryContact: "Primary contact",
  goals: "Goals",
  notes: "Notes (replace)",
  notesAppend: "Notes (append)",
};

function fmt(v: unknown): string {
  if (v === null || v === undefined || v === "") return "—";
  if (typeof v === "boolean") return v ? "yes" : "no";
  return String(v);
}

export default function ModifyClient() {
  const router = useRouter();
  const [text, setText] = useState("");
  const [parsing, setParsing] = useState(false);
  const [explanation, setExplanation] = useState("");
  const [ambiguous, setAmbiguous] = useState<string[]>([]);
  const [previews, setPreviews] = useState<Preview[] | null>(null);
  const [deletes, setDeletes] = useState<DeletePreview[]>([]);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [error, setError] = useState("");
  const [pending, startTransition] = useTransition();
  const [done, setDone] = useState<{ applied: number; deleted: number } | null>(null);

  async function parse() {
    setError("");
    setDone(null);
    setParsing(true);
    try {
      const r = await fetch("/api/parse-update", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ text }),
      });
      const data = await r.json();
      if (!r.ok) throw new Error(data.error ?? "Failed");
      setExplanation(data.explanation ?? "");
      setAmbiguous(data.ambiguous ?? []);
      setPreviews(data.previews ?? []);
      setDeletes(data.deletes ?? []);
      setConfirmDelete(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed");
    } finally {
      setParsing(false);
    }
  }

  function dropPreview(idx: number) {
    setPreviews((p) => (p ? p.filter((_, i) => i !== idx) : p));
  }
  function dropDelete(idx: number) {
    setDeletes((d) => d.filter((_, i) => i !== idx));
  }
  function reset() {
    setPreviews(null);
    setDeletes([]);
    setConfirmDelete(false);
    setExplanation("");
    setAmbiguous([]);
    setText("");
    setDone(null);
  }

  function commit() {
    if (!previews?.length && !deletes.length) return;
    if (deletes.length > 0 && !confirmDelete) {
      setError("Tick the delete confirmation checkbox first.");
      return;
    }
    setError("");
    startTransition(async () => {
      const updates = (previews ?? []).map((p) => ({ studentId: p.studentId, patch: p.patch }));
      const dels = deletes.map((d) => ({ studentId: d.studentId }));
      const r = await fetch("/api/commit-updates", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ updates, deletes: dels }),
      });
      const data = await r.json();
      if (!r.ok) {
        setError(data.error ?? "Save failed");
        return;
      }
      setDone({ applied: data.applied, deleted: data.deleted });
      setPreviews(null);
      setDeletes([]);
      setText("");
      router.refresh();
    });
  }

  return (
    <div className="space-y-4">
      <div className="card space-y-3">
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          rows={3}
          className="input"
          placeholder='e.g. "set Casey&apos;s primary contact to Sam, and note that she came to Weekly Meeting 5/1"'
        />
        <div className="flex gap-2">
          <button className="btn-primary" disabled={!text.trim() || parsing} onClick={parse}>
            {parsing ? "Processing…" : "Preview changes"}
          </button>
          {(previews || done) && <button className="btn-ghost" onClick={reset}>Clear</button>}
        </div>
      </div>

      {error && <p className="text-sm text-red-600">{error}</p>}

      {done && (
        <div className="card text-sm">
          ✓ Applied {done.applied} update{done.applied === 1 ? "" : "s"}
          {done.deleted > 0 && `, deleted ${done.deleted} student${done.deleted === 1 ? "" : "s"}`}.
        </div>
      )}

      {explanation && (previews || deletes.length > 0) && (
        <div className="text-sm text-black/60 italic">→ {explanation}</div>
      )}

      {ambiguous.length > 0 && (
        <div className="card border-amber-500/40">
          <div className="text-sm font-medium text-amber-700">
            ⚠️ Couldn't resolve these names — please be more specific or use last names:
          </div>
          <ul className="list-disc list-inside text-sm mt-1">
            {ambiguous.map((n) => <li key={n}>{n}</li>)}
          </ul>
        </div>
      )}

      {previews && previews.length > 0 && (
        <div className="space-y-3">
          {previews.map((p, i) => {
            const before = p.before;
            const patchEntries = Object.entries(p.patch).filter(([, v]) => v !== undefined);
            return (
              <div key={i} className="card space-y-2">
                <div className="flex items-center justify-between">
                  <Link
                    href={`/students/${p.studentId}`}
                    className="font-semibold hover:underline"
                  >
                    {before ? `${before.firstName} ${before.lastName ?? ""}`.trim() : `Student #${p.studentId}`}
                  </Link>
                  <button onClick={() => dropPreview(i)} className="text-xs text-black/40 hover:text-red-600">
                    skip
                  </button>
                </div>
                <div className="overflow-x-auto">
                <table className="text-sm">
                  <thead>
                    <tr><th className="w-1/4">Field</th><th>Before</th><th>After</th></tr>
                  </thead>
                  <tbody>
                    {patchEntries.map(([k, v]) => {
                      const isAppend = k === "notesAppend";
                      const beforeVal = isAppend ? before?.notes : before?.[k];
                      const afterVal = isAppend
                        ? (before?.notes ? `${before.notes}\n[${new Date().toISOString().slice(0, 10)}] ${v}` : `[${new Date().toISOString().slice(0, 10)}] ${v}`)
                        : v;
                      return (
                        <tr key={k}>
                          <td className="text-xs text-black/60 align-top">{FIELD_LABEL[k] ?? k}</td>
                          <td className="align-top whitespace-pre-wrap text-black/50">{fmt(beforeVal)}</td>
                          <td className="align-top whitespace-pre-wrap font-medium">{fmt(afterVal)}</td>
                        </tr>
                      );
                    })}
                    {patchEntries.length === 0 && (
                      <tr><td colSpan={3} className="text-black/40 text-center">No changes proposed.</td></tr>
                    )}
                  </tbody>
                </table>
                </div>
              </div>
            );
          })}

        </div>
      )}

      {deletes.length > 0 && (
        <div className="card border-2 border-red-500/50 bg-red-500/5 space-y-3">
          <div>
            <h2 className="font-semibold text-red-700">⚠ Permanent deletion</h2>
            <p className="text-sm text-red-700/80">
              These students will be removed entirely, along with their attendance history. This cannot be undone.
            </p>
          </div>
          <ul className="space-y-1">
            {deletes.map((d, i) => (
              <li key={i} className="flex items-center justify-between border border-red-500/30 rounded-md px-3 py-2 bg-white/40 dark:bg-black/20">
                <div>
                  <Link href={`/students/${d.studentId}`} className="font-medium hover:underline">
                    {d.student
                      ? `${d.student.firstName} ${d.student.lastName ?? ""}`.trim()
                      : `Student #${d.studentId}`}
                  </Link>
                  {d.reason && <span className="ml-2 text-xs text-black/50">— {d.reason}</span>}
                </div>
                <button onClick={() => dropDelete(i)} className="text-xs text-black/40 hover:text-red-700">
                  keep
                </button>
              </li>
            ))}
          </ul>
          <label className="flex items-center gap-2 text-sm text-red-700">
            <input
              type="checkbox"
              checked={confirmDelete}
              onChange={(e) => setConfirmDelete(e.target.checked)}
            />
            I understand this is permanent.
          </label>
        </div>
      )}

      {(previews?.length || deletes.length > 0) && (
        <div className="flex justify-end">
          <button
            className={deletes.length > 0 && confirmDelete ? "btn bg-red-600 text-white hover:opacity-90" : "btn-primary"}
            disabled={pending || (deletes.length > 0 && !confirmDelete)}
            onClick={commit}
          >
            {pending
              ? "Saving…"
              : deletes.length > 0
                ? `Apply ${previews?.length ?? 0} update${(previews?.length ?? 0) === 1 ? "" : "s"} + delete ${deletes.length}`
                : `Apply ${previews?.length ?? 0} update${(previews?.length ?? 0) === 1 ? "" : "s"}`}
          </button>
        </div>
      )}

      {previews && previews.length === 0 && deletes.length === 0 && ambiguous.length === 0 && (
        <p className="text-sm text-black/50">
          No updates found from that input. Try being more specific, e.g. "set Casey's primary contact to Sam" or "delete the duplicate Alex Rivera".
        </p>
      )}
    </div>
  );
}
