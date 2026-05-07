"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";

type Row = {
  id: number;
  firstName: string;
  lastName: string | null;
  year: string | null;
  gender: string | null;
  memberStatus: string | null;
  igHandle: string | null;
  isActive: boolean;
};

type Patch = Record<string, unknown> & { notesAppend?: string };
type Preview = { studentId: number; before: Record<string, any> | null; patch: Patch };
type CreatePreview = Record<string, unknown> & { firstName: string };
type DeletePreview = { studentId: number; student: Record<string, any> | null; reason: string };

type QueryResult = { mode: "query"; rows: Row[]; explanation: string; filters: Record<string, unknown> };
type UpdateResult = {
  mode: "update";
  explanation: string;
  ambiguous: string[];
  previews: Preview[];
  creates: CreatePreview[];
  deletes: DeletePreview[];
};
type Result = QueryResult | UpdateResult;

const FIELD_LABEL: Record<string, string> = {
  firstName: "First name", lastName: "Last name", gender: "Gender", year: "Year",
  phone: "Phone", email: "Email", igHandle: "IG handle", memberStatus: "Status",
  isActive: "Active", contactedViaIg: "In IG groupchat", primaryContact: "Primary contact",
  goals: "Goals", notes: "Notes (replace)", notesAppend: "Notes (append)",
};

function fmt(v: unknown): string {
  if (v === null || v === undefined || v === "") return "—";
  if (typeof v === "boolean") return v ? "yes" : "no";
  return String(v);
}

export default function AskClient() {
  const router = useRouter();
  const [text, setText] = useState("");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<Result | null>(null);
  const [error, setError] = useState("");

  const [previews, setPreviews] = useState<Preview[]>([]);
  const [creates, setCreates] = useState<CreatePreview[]>([]);
  const [deletes, setDeletes] = useState<DeletePreview[]>([]);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [pending, startTransition] = useTransition();
  const [done, setDone] = useState<{ applied: number; created: number; deleted: number } | null>(null);

  async function ask() {
    setError("");
    setDone(null);
    setResult(null);
    setLoading(true);
    try {
      const r = await fetch("/api/ask", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ text }),
      });
      const data = await r.json();
      if (!r.ok) throw new Error(data.error ?? "Failed");
      setResult(data as Result);
      if (data.mode === "update") {
        setPreviews(data.previews ?? []);
        setCreates(data.creates ?? []);
        setDeletes(data.deletes ?? []);
        setConfirmDelete(false);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed");
    } finally {
      setLoading(false);
    }
  }

  function reset() {
    setResult(null);
    setPreviews([]);
    setCreates([]);
    setDeletes([]);
    setConfirmDelete(false);
    setText("");
    setDone(null);
  }

  function commit() {
    if (!previews.length && !creates.length && !deletes.length) return;
    if (deletes.length > 0 && !confirmDelete) {
      setError("Tick the delete confirmation checkbox first.");
      return;
    }
    setError("");
    startTransition(async () => {
      const updates = previews.map((p) => ({ studentId: p.studentId, patch: p.patch }));
      const dels = deletes.map((d) => ({ studentId: d.studentId }));
      const r = await fetch("/api/commit-updates", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ updates, creates, deletes: dels }),
      });
      const data = await r.json();
      if (!r.ok) { setError(data.error ?? "Save failed"); return; }
      setDone({ applied: data.applied, created: data.created, deleted: data.deleted });
      setResult(null);
      setPreviews([]);
      setCreates([]);
      setDeletes([]);
      setText("");
      router.refresh();
    });
  }

  function exportCsv(rows: Row[]) {
    const header = ["id", "first", "last", "year", "gender", "status", "ig", "active"];
    const lines = [header.join(",")].concat(
      rows.map((r) =>
        [r.id, r.firstName, r.lastName ?? "", r.year ?? "", r.gender ?? "", r.memberStatus ?? "", r.igHandle ?? "", r.isActive ? "1" : "0"]
          .map((x) => `"${String(x).replace(/"/g, '""')}"`)
          .join(",")
      )
    );
    const blob = new Blob([lines.join("\n")], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "fold-query.csv";
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="space-y-4">
      <div className="card flex gap-2">
        <textarea
          className="input"
          value={text}
          onChange={(e) => setText(e.target.value)}
          rows={2}
          placeholder={'"show me all the guys who are core members" or "mark Kenzie as core, add Sarah Kim sophomore"'}
          onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); ask(); } }}
        />
        <button className="btn-primary self-end" disabled={!text.trim() || loading} onClick={ask}>
          {loading ? "Thinking…" : "Ask"}
        </button>
      </div>
      {(result || done) && <button className="btn-ghost text-xs" onClick={reset}>Clear</button>}
      {error && <p className="text-sm text-red-600">{error}</p>}

      {done && (
        <div className="card text-sm">
          Applied {done.applied} update{done.applied === 1 ? "" : "s"}
          {done.created > 0 && `, added ${done.created} student${done.created === 1 ? "" : "s"}`}
          {done.deleted > 0 && `, deleted ${done.deleted} student${done.deleted === 1 ? "" : "s"}`}.
        </div>
      )}

      {result?.mode === "query" && (
        <>
          {result.explanation && (
            <div className="text-sm text-black/60 italic">{result.explanation}</div>
          )}
          <div className="card overflow-x-auto">
            <div className="flex items-center justify-between mb-2">
              <h2 className="font-semibold">{result.rows.length} result{result.rows.length === 1 ? "" : "s"}</h2>
              {result.rows.length > 0 && (
                <button onClick={() => exportCsv(result.rows)} className="btn-ghost text-xs">CSV</button>
              )}
            </div>
            <table>
              <thead>
                <tr><th>Name</th><th>Year</th><th>Gender</th><th>Status</th><th>IG</th></tr>
              </thead>
              <tbody>
                {result.rows.map((r) => (
                  <tr key={r.id} className="hover:bg-black/5 dark:hover:bg-white/5">
                    <td><Link href={`/students/${r.id}`} className="hover:underline">{r.firstName} {r.lastName ?? ""}</Link></td>
                    <td>{r.year ?? "—"}</td>
                    <td>{r.gender ?? "—"}</td>
                    <td>{r.memberStatus ?? "—"}</td>
                    <td>{r.igHandle ? `@${r.igHandle}` : "—"}</td>
                  </tr>
                ))}
                {result.rows.length === 0 && <tr><td colSpan={5} className="text-center text-black/50 py-4">No matches.</td></tr>}
              </tbody>
            </table>
          </div>
        </>
      )}

      {result?.mode === "update" && (
        <>
          {result.explanation && (
            <div className="text-sm text-black/60 italic">{result.explanation}</div>
          )}

          {result.ambiguous.length > 0 && (
            <div className="card border-amber-500/40">
              <div className="text-sm font-medium text-amber-700">
                Couldn't resolve these names, please be more specific:
              </div>
              <ul className="list-disc list-inside text-sm mt-1">
                {result.ambiguous.map((n) => <li key={n}>{n}</li>)}
              </ul>
            </div>
          )}

          {previews.length > 0 && (
            <div className="space-y-3">
              {previews.map((p, i) => {
                const before = p.before;
                const patchEntries = Object.entries(p.patch).filter(([, v]) => v !== undefined);
                return (
                  <div key={i} className="card space-y-2">
                    <div className="flex items-center justify-between">
                      <Link href={`/students/${p.studentId}`} className="font-semibold hover:underline">
                        {before ? `${before.firstName} ${before.lastName ?? ""}`.trim() : `Student #${p.studentId}`}
                      </Link>
                      <button onClick={() => setPreviews((prev) => prev.filter((_, idx) => idx !== i))} className="text-xs text-black/40 hover:text-red-600">skip</button>
                    </div>
                    <div className="overflow-x-auto">
                      <table className="text-sm">
                        <thead><tr><th className="w-1/4">Field</th><th>Before</th><th>After</th></tr></thead>
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

          {creates.length > 0 && (
            <div className="space-y-3">
              <div className="label">New students ({creates.length})</div>
              {creates.map((c, i) => {
                const fields = Object.entries(c).filter(([, v]) => v !== undefined && v !== null && v !== "");
                return (
                  <div key={i} className="card space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="font-semibold">
                        <span className="chip bg-emerald-500/15 text-emerald-700 mr-2">new</span>
                        {`${c.firstName} ${(c as any).lastName ?? ""}`.trim()}
                      </span>
                      <button onClick={() => setCreates((prev) => prev.filter((_, idx) => idx !== i))} className="text-xs text-black/40 hover:text-red-600">skip</button>
                    </div>
                    <div className="overflow-x-auto">
                      <table className="text-sm">
                        <thead><tr><th>Field</th><th>Value</th></tr></thead>
                        <tbody>
                          {fields.map(([k, v]) => (
                            <tr key={k}>
                              <td className="text-xs text-black/60">{FIELD_LABEL[k] ?? k}</td>
                              <td className="font-medium">{fmt(v)}</td>
                            </tr>
                          ))}
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
                <h2 className="font-semibold text-red-700">Permanent deletion</h2>
                <p className="text-sm text-red-700/80">These students will be removed entirely, along with their attendance history.</p>
              </div>
              <ul className="space-y-1">
                {deletes.map((d, i) => (
                  <li key={i} className="flex items-center justify-between border border-red-500/30 rounded-md px-3 py-2 bg-white/40 dark:bg-black/20">
                    <div>
                      <Link href={`/students/${d.studentId}`} className="font-medium hover:underline">
                        {d.student ? `${d.student.firstName} ${d.student.lastName ?? ""}`.trim() : `Student #${d.studentId}`}
                      </Link>
                      {d.reason && <span className="ml-2 text-xs text-black/50">{d.reason}</span>}
                    </div>
                    <button onClick={() => setDeletes((prev) => prev.filter((_, idx) => idx !== i))} className="text-xs text-black/40 hover:text-red-700">keep</button>
                  </li>
                ))}
              </ul>
              <label className="flex items-center gap-2 text-sm text-red-700">
                <input type="checkbox" checked={confirmDelete} onChange={(e) => setConfirmDelete(e.target.checked)} />
                I understand this is permanent.
              </label>
            </div>
          )}

          {(previews.length > 0 || creates.length > 0 || deletes.length > 0) && (
            <div className="flex justify-end">
              <button
                className={deletes.length > 0 && confirmDelete ? "btn bg-red-600 text-white hover:opacity-90" : "btn-primary"}
                disabled={pending || (deletes.length > 0 && !confirmDelete)}
                onClick={commit}
              >
                {pending
                  ? "Saving…"
                  : [
                      previews.length > 0 && `${previews.length} update${previews.length === 1 ? "" : "s"}`,
                      creates.length > 0 && `${creates.length} new`,
                      deletes.length > 0 && `delete ${deletes.length}`,
                    ].filter(Boolean).join(" + ") || "Apply"}
              </button>
            </div>
          )}

          {previews.length === 0 && creates.length === 0 && deletes.length === 0 && result.ambiguous.length === 0 && (
            <p className="text-sm text-black/50">
              Nothing found. Try e.g. "mark Kenzie as core member", "add Sarah Kim, sophomore", or "delete the duplicate entry".
            </p>
          )}
        </>
      )}
    </div>
  );
}
