"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

type Parsed = {
  match: "existing" | "new";
  studentId?: number;
  firstName?: string;
  lastName?: string;
  gender?: "M" | "F";
  year?: string;
  igHandle?: string;
  notes?: string;
  rawText: string;
  // ui-only
  _existingName?: string;
};

export default function AttendanceDumper({ eventId }: { eventId: number }) {
  const router = useRouter();
  const [text, setText] = useState("");
  const [parsed, setParsed] = useState<Parsed[] | null>(null);
  const [explanation, setExplanation] = useState<string>("");
  const [error, setError] = useState<string>("");
  const [parsing, setParsing] = useState(false);
  const [pending, startTransition] = useTransition();

  async function parse() {
    setError("");
    setParsing(true);
    try {
      const r = await fetch("/api/parse-attendance", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ eventId, text }),
      });
      const data = await r.json();
      if (!r.ok) throw new Error(data.error ?? "Parse failed");
      setParsed(data.attendees);
      setExplanation(data.explanation ?? "");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed");
    } finally {
      setParsing(false);
    }
  }

  function update(i: number, patch: Partial<Parsed>) {
    setParsed((p) => (p ? p.map((x, idx) => (idx === i ? { ...x, ...patch } : x)) : p));
  }
  function remove(i: number) {
    setParsed((p) => (p ? p.filter((_, idx) => idx !== i) : p));
  }

  async function commit() {
    if (!parsed) return;
    setError("");
    startTransition(async () => {
      const r = await fetch("/api/commit-attendance", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ eventId, attendees: parsed }),
      });
      const data = await r.json();
      if (!r.ok) {
        setError(data.error ?? "Save failed");
        return;
      }
      setText("");
      setParsed(null);
      setExplanation("");
      router.refresh();
    });
  }

  return (
    <div className="card space-y-3">
      <div>
        <label className="label" htmlFor="dump">Type or paste attendees</label>
        <textarea
          id="dump"
          value={text}
          onChange={(e) => setText(e.target.value)}
          rows={4}
          className="input"
          placeholder="e.g. Alex Rivera, Jordan Chen, Taylor (new freshman bro IG @alexr), Sam"
        />
      </div>
      <div className="flex gap-2">
        <button
          className="btn-primary"
          disabled={!text.trim() || parsing}
          onClick={parse}
        >
          {parsing ? "Processing…" : "Process"}
        </button>
        {parsed && (
          <button className="btn-ghost" onClick={() => { setParsed(null); setText(""); }}>
            Clear
          </button>
        )}
      </div>
      {error && <p className="text-sm text-red-600">{error}</p>}

      {parsed && (
        <div className="space-y-3 pt-2 border-t border-black/5 dark:border-white/10">
          {explanation && <p className="text-sm text-black/60 italic">{explanation}</p>}
          <div className="space-y-2">
            {parsed.map((p, i) => (
              <div key={i} className="rounded-lg border border-black/10 dark:border-white/10 p-3 space-y-2">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className={`chip ${p.match === "existing" ? "bg-emerald-500/15 text-emerald-700" : "bg-amber-500/15 text-amber-700"}`}>
                      {p.match === "existing" ? "existing" : "new"}
                    </span>
                    <span className="font-medium">
                      {p.match === "existing"
                        ? p._existingName ?? `Student #${p.studentId}`
                        : `${p.firstName ?? ""} ${p.lastName ?? ""}`.trim() || <em className="text-black/40">unnamed</em>}
                    </span>
                  </div>
                  <button onClick={() => remove(i)} className="text-xs text-black/40 hover:text-red-600">
                    drop
                  </button>
                </div>
                {p.match === "new" && (
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                    <input
                      className="input"
                      placeholder="First"
                      value={p.firstName ?? ""}
                      onChange={(e) => update(i, { firstName: e.target.value })}
                    />
                    <input
                      className="input"
                      placeholder="Last"
                      value={p.lastName ?? ""}
                      onChange={(e) => update(i, { lastName: e.target.value })}
                    />
                    <select
                      className="input"
                      value={p.year ?? ""}
                      onChange={(e) => update(i, { year: e.target.value || undefined })}
                    >
                      <option value="">year —</option>
                      {["freshman","sophomore","junior","senior","grad","other"].map(y => <option key={y} value={y}>{y}</option>)}
                    </select>
                    <select
                      className="input"
                      value={p.gender ?? ""}
                      onChange={(e) => update(i, { gender: (e.target.value as any) || undefined })}
                    >
                      <option value="">gender —</option>
                      <option value="M">Male</option>
                      <option value="F">Female</option>
                    </select>
                    <input
                      className="input"
                      placeholder="@ig"
                      value={p.igHandle ?? ""}
                      onChange={(e) => update(i, { igHandle: e.target.value.replace(/^@/, "") })}
                    />
                  </div>
                )}
                {p.notes && <p className="text-xs text-black/50">note: {p.notes}</p>}
                <p className="text-[11px] text-black/30">from: "{p.rawText}"</p>
              </div>
            ))}
          </div>
          <div className="flex justify-end">
            <button className="btn-primary" disabled={pending || parsed.length === 0} onClick={commit}>
              {pending ? "Saving…" : `Mark ${parsed.length} present`}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
