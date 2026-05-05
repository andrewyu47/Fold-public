"use client";

import { useState, useTransition } from "react";
import type { Channel } from "@/lib/funnel/types";

interface Draft {
  label: string;
  body: string;
}

interface DraftResponse {
  drafts: Draft[];
  explanation: string;
  channel: Channel;
}

const CHANNELS: { value: Channel; label: string }[] = [
  { value: "ig_dm", label: "IG DM" },
  { value: "text", label: "Text" },
  { value: "phone", label: "Phone opener" },
  { value: "email", label: "Email" },
  { value: "in_person", label: "In person" },
];

export default function DraftOutreach({ studentId }: { studentId: number }) {
  const [channel, setChannel] = useState<Channel>("ig_dm");
  const [purpose, setPurpose] = useState("");
  const [refinement, setRefinement] = useState("");
  const [drafts, setDrafts] = useState<Draft[] | null>(null);
  const [explanation, setExplanation] = useState("");
  const [error, setError] = useState("");
  const [pending, startTransition] = useTransition();
  const [copiedIdx, setCopiedIdx] = useState<number | null>(null);

  const generate = (withRefinement: boolean) => {
    setError("");
    startTransition(async () => {
      try {
        const r = await fetch(`/api/students/${studentId}/draft-outreach`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            channel,
            purpose,
            refinement: withRefinement ? refinement : undefined,
          }),
        });
        const data = (await r.json()) as DraftResponse | { error: string };
        if (!r.ok || "error" in data) {
          setError(("error" in data && data.error) || `Failed (${r.status})`);
          return;
        }
        setDrafts(data.drafts);
        setExplanation(data.explanation);
        if (!withRefinement) setRefinement("");
      } catch (e) {
        setError(e instanceof Error ? e.message : "Network error");
      }
    });
  };

  const copy = async (idx: number, body: string) => {
    try {
      await navigator.clipboard.writeText(body);
      setCopiedIdx(idx);
      setTimeout(() => setCopiedIdx((c) => (c === idx ? null : c)), 1500);
    } catch {
      // ignore
    }
  };

  return (
    <div className="card space-y-4">
      <div className="flex items-baseline justify-between">
        <h2 className="font-semibold">Draft a message</h2>
        <span className="text-xs text-black/50">Generated from this student&apos;s record.</span>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-2">
        <select
          className="input md:col-span-1"
          value={channel}
          onChange={(e) => setChannel(e.target.value as Channel)}
        >
          {CHANNELS.map((c) => (
            <option key={c.value} value={c.value}>
              {c.label}
            </option>
          ))}
        </select>
        <input
          className="input md:col-span-3"
          placeholder="What do you want to say? (e.g. invite to BBQ Sat 3pm, follow up on coffee chat)"
          value={purpose}
          onChange={(e) => setPurpose(e.target.value)}
        />
      </div>
      <div className="flex items-center gap-3">
        <button className="btn-primary" onClick={() => generate(false)} disabled={pending}>
          {pending && drafts === null ? "Drafting…" : drafts ? "Regenerate" : "Draft a message"}
        </button>
        {error && <span className="text-sm text-red-600">{error}</span>}
        {explanation && !error && (
          <span className="text-xs text-black/50 italic">{explanation}</span>
        )}
      </div>

      {drafts && drafts.length > 0 && (
        <div className="space-y-3 pt-3 border-t border-black/5 dark:border-white/10">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            {drafts.map((d, i) => (
              <div
                key={i}
                className="rounded-lg border border-black/10 dark:border-white/10 p-3 space-y-2 flex flex-col"
              >
                <div className="flex items-center justify-between">
                  <span className="chip">{d.label}</span>
                  <button
                    className="text-xs underline hover:text-accent"
                    onClick={() => copy(i, d.body)}
                  >
                    {copiedIdx === i ? "copied!" : "copy"}
                  </button>
                </div>
                <pre className="text-sm whitespace-pre-wrap font-sans flex-1">{d.body}</pre>
              </div>
            ))}
          </div>

          <div className="grid grid-cols-1 md:grid-cols-4 gap-2 pt-2 border-t border-black/5 dark:border-white/10">
            <input
              className="input md:col-span-3"
              placeholder='Refine: e.g. "more casual" or "shorter" or "mention the BBQ Saturday"'
              value={refinement}
              onChange={(e) => setRefinement(e.target.value)}
            />
            <button
              className="btn-ghost"
              onClick={() => generate(true)}
              disabled={pending || !refinement.trim()}
            >
              {pending ? "Refining…" : "Regenerate"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
