"use client";

import { useState } from "react";
import Link from "next/link";

type Row = {
  id: number;
  firstName: string;
  lastName: string | null;
  year: string | null;
  gender: string | null;
  igHandle: string | null;
  isActive: boolean;
};

export default function QueryClient() {
  const [q, setQ] = useState("");
  const [loading, setLoading] = useState(false);
  const [explanation, setExplanation] = useState("");
  const [rows, setRows] = useState<Row[] | null>(null);
  const [error, setError] = useState("");
  const [filters, setFilters] = useState<Record<string, unknown> | null>(null);

  async function ask() {
    setError("");
    setLoading(true);
    try {
      const r = await fetch("/api/nl-query", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ query: q }),
      });
      const data = await r.json();
      if (!r.ok) throw new Error(data.error ?? "failed");
      setRows(data.rows);
      setExplanation(data.explanation ?? "");
      setFilters(data.filters ?? null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed");
    } finally {
      setLoading(false);
    }
  }

  function exportCsv() {
    if (!rows) return;
    const header = ["id", "first", "last", "year", "gender", "ig", "active"];
    const lines = [header.join(",")].concat(
      rows.map((r) =>
        [r.id, r.firstName, r.lastName ?? "", r.year ?? "", r.gender ?? "", r.igHandle ?? "", r.isActive ? "1" : "0"]
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
        <input
          className="input"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="all the bros who came to the last event"
          onKeyDown={(e) => e.key === "Enter" && ask()}
        />
        <button className="btn-primary" disabled={!q.trim() || loading} onClick={ask}>
          {loading ? "Asking…" : "Ask"}
        </button>
      </div>
      {error && <p className="text-sm text-red-600">{error}</p>}
      {explanation && (
        <div className="text-sm text-black/60 italic">
          → {explanation}
          {filters && (
            <pre className="not-italic mt-1 text-[10px] text-black/40 overflow-x-auto">{JSON.stringify(filters, null, 2)}</pre>
          )}
        </div>
      )}
      {rows && (
        <div className="card overflow-x-auto">
          <div className="flex items-center justify-between mb-2">
            <h2 className="font-semibold">{rows.length} result{rows.length === 1 ? "" : "s"}</h2>
            {rows.length > 0 && (
              <button onClick={exportCsv} className="btn-ghost text-xs">↓ CSV</button>
            )}
          </div>
          <table>
            <thead>
              <tr>
                <th>Name</th><th>Year</th><th>Gender</th><th>IG</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id} className="hover:bg-black/5 dark:hover:bg-white/5">
                  <td>
                    <Link href={`/students/${r.id}`} className="hover:underline">
                      {r.firstName} {r.lastName ?? ""}
                    </Link>
                  </td>
                  <td>{r.year ?? "—"}</td>
                  <td>{r.gender ?? "—"}</td>
                  <td>{r.igHandle ? `@${r.igHandle}` : "—"}</td>
                </tr>
              ))}
              {rows.length === 0 && <tr><td colSpan={4} className="text-center text-black/50 py-4">No matches.</td></tr>}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
