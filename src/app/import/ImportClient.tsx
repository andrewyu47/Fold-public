"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { SCHEMA_FIELDS, type SchemaField } from "@/lib/csv";

type Preview = {
  headers: string[];
  sample: string[][];
  totalRows: number;
  mapping: SchemaField[];
};

export default function ImportClient() {
  const router = useRouter();
  const [csvText, setCsvText] = useState("");
  const [preview, setPreview] = useState<Preview | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<{ created: number; updated: number } | null>(null);

  async function onFile(f: File) {
    setError("");
    const text = await f.text();
    setCsvText(text);
    await preview_(text, undefined);
  }

  async function preview_(text: string, mapping?: SchemaField[]) {
    setBusy(true);
    try {
      const r = await fetch("/api/import", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ csv: text, mode: "preview", mapping }),
      });
      const data = await r.json();
      if (!r.ok) throw new Error(data.error ?? "Failed");
      setPreview(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed");
    } finally {
      setBusy(false);
    }
  }

  async function commit() {
    if (!preview) return;
    setBusy(true);
    setError("");
    try {
      const r = await fetch("/api/import", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ csv: csvText, mode: "commit", mapping: preview.mapping }),
      });
      const data = await r.json();
      if (!r.ok) throw new Error(data.error ?? "Failed");
      setResult({ created: data.created, updated: data.updated });
      setPreview(null);
      setCsvText("");
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-4">
      {!preview && !result && (
        <label className="card flex items-center justify-center h-40 border-2 border-dashed border-black/15 dark:border-white/15 cursor-pointer hover:bg-black/5 dark:hover:bg-white/5">
          <input
            type="file"
            accept=".csv,text/csv"
            className="hidden"
            onChange={(e) => e.target.files?.[0] && onFile(e.target.files[0])}
          />
          <span className="text-sm text-black/60">Click or drop a CSV here</span>
        </label>
      )}

      {error && <p className="text-sm text-red-600">{error}</p>}

      {result && (
        <div className="card text-sm">
          ✓ Imported. Created {result.created} students, updated {result.updated}.
          <button className="btn-ghost ml-3 text-xs" onClick={() => setResult(null)}>Import another</button>
        </div>
      )}

      {preview && (
        <div className="space-y-4">
          <div className="card">
            <h2 className="font-semibold mb-2">Map columns</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
              {preview.headers.map((h, i) => (
                <div key={i} className="flex items-center gap-2">
                  <span className="text-sm flex-1 truncate" title={h}>{h}</span>
                  <span className="text-black/30">→</span>
                  <select
                    className="input flex-1"
                    value={preview.mapping[i]}
                    onChange={(e) => {
                      const m = [...preview.mapping];
                      m[i] = e.target.value as SchemaField;
                      setPreview({ ...preview, mapping: m });
                    }}
                  >
                    <option value="skip">— skip —</option>
                    {SCHEMA_FIELDS.map((f) => <option key={f} value={f}>{f}</option>)}
                  </select>
                </div>
              ))}
            </div>
          </div>

          <div className="card overflow-x-auto">
            <h2 className="font-semibold mb-2">Sample (first 5 rows of {preview.totalRows})</h2>
            <table>
              <thead>
                <tr>{preview.headers.map((h, i) => (
                  <th key={i}>
                    <div>{h}</div>
                    <div className="text-[10px] text-accent">{preview.mapping[i]}</div>
                  </th>
                ))}</tr>
              </thead>
              <tbody>
                {preview.sample.map((r, i) => (
                  <tr key={i}>{r.map((v, j) => <td key={j} className="text-xs">{v}</td>)}</tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="flex justify-end gap-2">
            <button className="btn-ghost" onClick={() => { setPreview(null); setCsvText(""); }}>Cancel</button>
            <button className="btn-primary" disabled={busy} onClick={commit}>
              {busy ? "Importing…" : `Import ${preview.totalRows} rows`}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
