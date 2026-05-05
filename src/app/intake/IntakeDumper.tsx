"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { ParsedContact, IntakePreview, Channel } from "@/lib/funnel/types";

const CHANNELS: { value: Channel; label: string }[] = [
  { value: "in_person", label: "In person" },
  { value: "ig_dm", label: "IG DM" },
  { value: "text", label: "Text" },
  { value: "phone", label: "Phone" },
  { value: "email", label: "Email" },
  { value: "other", label: "Other" },
];

export default function IntakeDumper() {
  const router = useRouter();
  const [text, setText] = useState("");
  const [parsing, setParsing] = useState(false);
  const [preview, setPreview] = useState<IntakePreview | null>(null);
  const [error, setError] = useState<string>("");
  const [pending, startTransition] = useTransition();

  async function parse() {
    setError("");
    setParsing(true);
    try {
      const r = await fetch("/api/intake/parse", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ text }),
      });
      const data = await r.json();
      if (!r.ok) throw new Error(data.error ?? "Parse failed");
      setPreview(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed");
    } finally {
      setParsing(false);
    }
  }

  function update(idx: number, patch: Partial<ParsedContact>) {
    setPreview((p) =>
      p ? { ...p, contacts: p.contacts.map((c, i) => (i === idx ? { ...c, ...patch } : c)) } : p
    );
  }
  function remove(idx: number) {
    setPreview((p) => (p ? { ...p, contacts: p.contacts.filter((_, i) => i !== idx) } : p));
  }
  function adoptDuplicate(idx: number, candidateStudentId: number) {
    update(idx, {
      match: "existing",
      studentId: candidateStudentId,
      // clear new-only fields
      firstName: undefined,
      lastName: undefined,
      gender: undefined,
      year: undefined,
      igHandle: undefined,
      phone: undefined,
      email: undefined,
      serverDedupCandidates: [],
      existingDisplayName: preview?.contacts[idx].serverDedupCandidates.find(
        (c) => c.studentId === candidateStudentId
      )?.displayName,
    });
  }

  async function commit() {
    if (!preview) return;
    setError("");
    startTransition(async () => {
      try {
        const r = await fetch("/api/intake/commit", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ contacts: preview.contacts }),
        });
        const data = await r.json();
        if (!r.ok) throw new Error(data.error ?? "Save failed");
        setText("");
        setPreview(null);
        router.refresh();
      } catch (e) {
        setError(e instanceof Error ? e.message : "Save failed");
      }
    });
  }

  return (
    <div className="space-y-4">
      <div className="card space-y-3">
        <label className="label" htmlFor="dump">
          Tell me who you met / contacted, in your own words
        </label>
        <textarea
          id="dump"
          value={text}
          onChange={(e) => setText(e.target.value)}
          rows={5}
          className="input"
          placeholder='e.g. "Met Jordan Chen at the booth tonight, freshman bro, IG @jordanc. IG&apos;d Alex Wong yesterday, no reply. Saw Morgan at BBQ, she said she&apos;d come Sunday."'
        />
        <div className="flex items-center gap-2">
          <button
            className="btn-primary"
            disabled={!text.trim() || parsing}
            onClick={parse}
          >
            {parsing ? "Processing…" : "Process"}
          </button>
          {preview && (
            <button
              className="btn-ghost"
              onClick={() => {
                setPreview(null);
                setText("");
              }}
            >
              Clear
            </button>
          )}
          {error && <span className="text-sm text-red-600">{error}</span>}
        </div>
      </div>

      {preview && (
        <div className="space-y-3">
          {preview.explanation && (
            <p className="text-sm text-black/60 italic">{preview.explanation}</p>
          )}
          {preview.ambiguous.length > 0 && (
            <div className="card border-amber-300/50">
              <div className="text-sm font-medium text-amber-700 dark:text-amber-200">
                Ambiguous names
              </div>
              <div className="text-xs text-black/60 mt-1">
                These didn&apos;t match exactly one student. Add or rename them in /students, then re-parse.
              </div>
              <ul className="mt-2 flex flex-wrap gap-2">
                {preview.ambiguous.map((a) => (
                  <li key={a} className="chip">{a}</li>
                ))}
              </ul>
            </div>
          )}

          <div className="space-y-2">
            {preview.contacts.map((c, i) => (
              <ContactCard
                key={c.contactId}
                contact={c}
                onUpdate={(patch) => update(i, patch)}
                onRemove={() => remove(i)}
                onAdoptDuplicate={(sid) => adoptDuplicate(i, sid)}
              />
            ))}
          </div>

          <div className="flex justify-end">
            <button
              className="btn-primary"
              disabled={pending || preview.contacts.length === 0}
              onClick={commit}
            >
              {pending ? "Saving…" : `Commit ${preview.contacts.length} contact${preview.contacts.length === 1 ? "" : "s"}`}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function ContactCard({
  contact,
  onUpdate,
  onRemove,
  onAdoptDuplicate,
}: {
  contact: ParsedContact;
  onUpdate: (patch: Partial<ParsedContact>) => void;
  onRemove: () => void;
  onAdoptDuplicate: (studentId: number) => void;
}) {
  const isExisting = contact.match === "existing";
  const hasDupCandidates = !isExisting && contact.serverDedupCandidates.length > 0;

  return (
    <div className="rounded-lg border border-black/10 dark:border-white/10 p-3 space-y-2">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span
            className={`chip ${
              isExisting
                ? "bg-emerald-500/15 text-emerald-700"
                : "bg-amber-500/15 text-amber-700"
            }`}
          >
            {isExisting ? "existing" : "new"}
          </span>
          <span className="font-medium">
            {isExisting
              ? contact.existingDisplayName ?? `Student #${contact.studentId}`
              : `${contact.firstName ?? ""} ${contact.lastName ?? ""}`.trim() || (
                  <em className="text-black/40">unnamed</em>
                )}
          </span>
        </div>
        <button
          onClick={onRemove}
          className="text-xs text-black/40 hover:text-red-600"
        >
          drop
        </button>
      </div>

      {hasDupCandidates && (
        <div className="rounded border border-amber-400/50 bg-amber-50 dark:bg-amber-500/10 p-2 text-sm space-y-1">
          <div className="font-medium text-amber-800 dark:text-amber-200">
            Possible duplicate{contact.serverDedupCandidates.length > 1 ? "s" : ""}:
          </div>
          {contact.serverDedupCandidates.map((cand) => (
            <div key={cand.studentId} className="flex items-center justify-between gap-2">
              <span className="text-black/80 dark:text-white/80">
                {cand.displayName}
                <span className="text-xs text-black/50 ml-2">
                  {cand.reasons.join(", ")} • score {cand.score}
                  {cand.addedByDisplayName ? ` • added by ${cand.addedByDisplayName}` : ""}
                </span>
              </span>
              <button
                className="btn-ghost text-xs"
                onClick={() => onAdoptDuplicate(cand.studentId)}
              >
                Same person →
              </button>
            </div>
          ))}
        </div>
      )}

      {!isExisting && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
          <input
            className="input"
            placeholder="First"
            value={contact.firstName ?? ""}
            onChange={(e) => onUpdate({ firstName: e.target.value })}
          />
          <input
            className="input"
            placeholder="Last"
            value={contact.lastName ?? ""}
            onChange={(e) => onUpdate({ lastName: e.target.value })}
          />
          <select
            className="input"
            value={contact.year ?? ""}
            onChange={(e) => onUpdate({ year: e.target.value || undefined })}
          >
            <option value="">year —</option>
            {["freshman", "sophomore", "junior", "senior", "grad", "other"].map((y) => (
              <option key={y} value={y}>
                {y}
              </option>
            ))}
          </select>
          <select
            className="input"
            value={contact.gender ?? ""}
            onChange={(e) =>
              onUpdate({ gender: (e.target.value || undefined) as "M" | "F" | undefined })
            }
          >
            <option value="">gender —</option>
            <option value="M">M</option>
            <option value="F">F</option>
          </select>
          <input
            className="input"
            placeholder="@ig"
            value={contact.igHandle ?? ""}
            onChange={(e) => onUpdate({ igHandle: e.target.value.replace(/^@/, "") })}
          />
          <input
            className="input"
            placeholder="phone"
            value={contact.phone ?? ""}
            onChange={(e) => onUpdate({ phone: e.target.value })}
          />
          <input
            className="input col-span-2"
            placeholder="email"
            type="email"
            value={contact.email ?? ""}
            onChange={(e) => onUpdate({ email: e.target.value })}
          />
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-3 gap-2 pt-2 border-t border-black/5 dark:border-white/10">
        <input
          className="input md:col-span-2"
          placeholder="Where/how met (optional)"
          value={contact.firstMetContext ?? ""}
          onChange={(e) => onUpdate({ firstMetContext: e.target.value })}
        />
        <select
          className="input"
          value={contact.attemptedChannel ?? ""}
          onChange={(e) =>
            onUpdate({ attemptedChannel: (e.target.value || undefined) as Channel | undefined })
          }
        >
          <option value="">no attempt logged</option>
          {CHANNELS.map((ch) => (
            <option key={ch.value} value={ch.value}>
              {ch.label}
            </option>
          ))}
        </select>
        {contact.attemptedChannel && (
          <>
            <input
              className="input md:col-span-2"
              placeholder="Channel detail (optional)"
              value={contact.attemptedChannelDetail ?? ""}
              onChange={(e) => onUpdate({ attemptedChannelDetail: e.target.value })}
            />
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={!!contact.responded}
                onChange={(e) => onUpdate({ responded: e.target.checked })}
              />
              Responded
            </label>
          </>
        )}
      </div>

      {contact.notes && <p className="text-xs text-black/50">note: {contact.notes}</p>}
      <p className="text-[11px] text-black/30">from: &quot;{contact.rawText}&quot;</p>
    </div>
  );
}
