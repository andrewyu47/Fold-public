"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

type Attendee = {
  match: "existing" | "new";
  studentId?: number;
  firstName?: string;
  lastName?: string;
  gender?: "M" | "F";
  year?: string;
  igHandle?: string;
  invitedById?: number;
  invitedByName?: string;
  _invitedByDisplayName?: string;
  notes?: string;
  rawText: string;
  _existingName?: string;
};

export interface RosterEntry {
  id: number;
  name: string;
}

type EventDraft = {
  name: string;
  date: string;
  type?: string;
  location?: string;
  isNew?: boolean;
};

type ParseResponse =
  | { mode: "single"; event: EventDraft; attendees: Attendee[] }
  | { mode: "batch"; events: EventDraft[] };

export default function QuickAdd({ roster = [] }: { roster?: RosterEntry[] }) {
  const router = useRouter();
  const [text, setText] = useState("");
  const [parsing, setParsing] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState<ParseResponse | null>(null);
  const [pending, startTransition] = useTransition();

  async function parse() {
    setError("");
    setParsing(true);
    try {
      const r = await fetch("/api/parse-event-batch", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ text }),
      });
      const data = await r.json();
      if (!r.ok) throw new Error(data.error ?? "Parse failed");
      setResult(data as ParseResponse);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed");
    } finally {
      setParsing(false);
    }
  }

  function reset() {
    setResult(null);
    setText("");
  }

  function commitSingle() {
    if (!result || result.mode !== "single") return;
    setError("");
    startTransition(async () => {
      const r = await fetch("/api/commit-event-batch", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          mode: "single",
          event: result.event,
          attendees: result.attendees,
        }),
      });
      const data = await r.json();
      if (!r.ok) {
        setError(data.error ?? "Save failed");
        return;
      }
      reset();
      router.push(`/events/${data.eventId}`);
      router.refresh();
    });
  }

  function commitBatch() {
    if (!result || result.mode !== "batch") return;
    setError("");
    startTransition(async () => {
      const r = await fetch("/api/commit-event-batch", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          mode: "batch",
          events: result.events,
        }),
      });
      const data = await r.json();
      if (!r.ok) {
        setError(data.error ?? "Save failed");
        return;
      }
      reset();
      router.push("/events");
      router.refresh();
    });
  }

  return (
    <div className="card space-y-3 border-accent/30">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="font-semibold">⚡ Quick add</h2>
          <p className="text-xs text-black/60">
            Describe one event with attendees, OR a list of events to create at once.
          </p>
        </div>
      </div>
      <textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        rows={3}
        className="input"
        placeholder={'Single: "add Alex Rivera, Jordan, Sam (new freshman bro) to new Weekly Meeting 5/1 at Community Center"\nBatch: "create the next 4 Weekly Meeting at Community Center: 5/1 5/8 5/15 5/22"'}
      />
      <div className="flex gap-2">
        <button className="btn-primary" disabled={!text.trim() || parsing} onClick={parse}>
          {parsing ? "Processing…" : "Process"}
        </button>
        {result && (
          <button className="btn-ghost" onClick={reset}>Clear</button>
        )}
      </div>
      {error && <p className="text-sm text-red-600">{error}</p>}

      {result?.mode === "single" && (
        <SingleEventPreview
          event={result.event}
          attendees={result.attendees}
          roster={roster}
          onEventChange={(ev) => setResult({ ...result, event: ev })}
          onAttendeesChange={(at) => setResult({ ...result, attendees: at })}
          onCommit={commitSingle}
          pending={pending}
        />
      )}

      {result?.mode === "batch" && (
        <BatchEventsPreview
          events={result.events}
          onChange={(events) => setResult({ ...result, events })}
          onCommit={commitBatch}
          pending={pending}
        />
      )}
    </div>
  );
}

function SingleEventPreview({
  event,
  attendees,
  roster,
  onEventChange,
  onAttendeesChange,
  onCommit,
  pending,
}: {
  event: EventDraft;
  attendees: Attendee[];
  roster: RosterEntry[];
  onEventChange: (ev: EventDraft) => void;
  onAttendeesChange: (at: Attendee[]) => void;
  onCommit: () => void;
  pending: boolean;
}) {
  const update = (i: number, patch: Partial<Attendee>) =>
    onAttendeesChange(attendees.map((x, idx) => (idx === i ? { ...x, ...patch } : x)));
  const remove = (i: number) =>
    onAttendeesChange(attendees.filter((_, idx) => idx !== i));

  return (
    <div className="space-y-3 pt-3 border-t border-black/5 dark:border-white/10">
      <div className="rounded-lg border border-black/10 dark:border-white/10 p-3 space-y-2">
        <div className="text-xs label">Proposed event</div>
        <div className="grid grid-cols-1 md:grid-cols-4 gap-2">
          <input
            className="input md:col-span-2"
            placeholder="Name"
            value={event.name}
            onChange={(e) => onEventChange({ ...event, name: e.target.value })}
          />
          <input
            className="input"
            type="date"
            value={event.date}
            onChange={(e) => onEventChange({ ...event, date: e.target.value })}
          />
          <input
            className="input"
            placeholder="Type"
            value={event.type ?? ""}
            onChange={(e) => onEventChange({ ...event, type: e.target.value })}
          />
          <input
            className="input md:col-span-4"
            placeholder="Location"
            value={event.location ?? ""}
            onChange={(e) => onEventChange({ ...event, location: e.target.value })}
          />
        </div>
      </div>

      <div className="space-y-2">
        <div className="label">Attendees ({attendees.length})</div>
        {attendees.length === 0 && (
          <p className="text-sm text-black/50">No attendees found. The event will be created empty.</p>
        )}
        {attendees.map((p, i) => (
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
              <button onClick={() => remove(i)} className="text-xs text-black/40 hover:text-red-600">drop</button>
            </div>
            {p.match === "new" && (
              <div className="space-y-2">
                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-2">
                  <input className="input" placeholder="First" value={p.firstName ?? ""} onChange={(e) => update(i, { firstName: e.target.value })} />
                  <input className="input" placeholder="Last" value={p.lastName ?? ""} onChange={(e) => update(i, { lastName: e.target.value })} />
                  <select className="input" value={p.year ?? ""} onChange={(e) => update(i, { year: e.target.value || undefined })}>
                    <option value="">year —</option>
                    {["freshman","sophomore","junior","senior","grad","other"].map(y => <option key={y} value={y}>{y}</option>)}
                  </select>
                  <select className="input" value={p.gender ?? ""} onChange={(e) => update(i, { gender: (e.target.value || undefined) as "M" | "F" | undefined })}>
                    <option value="">gender —</option>
                    <option value="M">Male</option>
                    <option value="F">Female</option>
                  </select>
                  <input className="input" placeholder="@ig" value={p.igHandle ?? ""} onChange={(e) => update(i, { igHandle: e.target.value.replace(/^@/, "") })} />
                </div>
                <InvitedByPicker
                  attendee={p}
                  roster={roster}
                  onChange={(patch) => update(i, patch)}
                />
              </div>
            )}
            <p className="text-[11px] text-black/30">from: &quot;{p.rawText}&quot;</p>
          </div>
        ))}
      </div>

      <div className="flex justify-end">
        <button className="btn-primary" disabled={pending || !event.name || !event.date} onClick={onCommit}>
          {pending ? "Saving…" : `Create event + mark ${attendees.length} present`}
        </button>
      </div>
    </div>
  );
}

function InvitedByPicker({
  attendee,
  roster,
  onChange,
}: {
  attendee: Attendee;
  roster: RosterEntry[];
  onChange: (patch: Partial<Attendee>) => void;
}) {
  const [text, setText] = useState(attendee._invitedByDisplayName ?? attendee.invitedByName ?? "");
  const datalistId = `roster-${attendee.studentId ?? attendee.firstName ?? Math.random()}`;

  const handle = (val: string) => {
    setText(val);
    const t = val.trim().toLowerCase();
    if (!t) {
      onChange({ invitedById: undefined, invitedByName: undefined, _invitedByDisplayName: undefined });
      return;
    }
    const match = roster.find((r) => r.name.toLowerCase() === t);
    if (match) {
      onChange({
        invitedById: match.id,
        invitedByName: match.name,
        _invitedByDisplayName: match.name,
      });
    } else {
      onChange({
        invitedById: undefined,
        invitedByName: val.trim(),
        _invitedByDisplayName: undefined,
      });
    }
  };

  const isResolved = !!attendee.invitedById;
  const hasText = !!text.trim();

  return (
    <div className="flex items-center gap-2 text-xs">
      <span className="label !text-[10px]">Invited by</span>
      <input
        className="input flex-1 max-w-xs text-xs"
        placeholder="(optional) inviter's name"
        list={datalistId}
        value={text}
        onChange={(e) => handle(e.target.value)}
      />
      <datalist id={datalistId}>
        {roster.map((r) => (
          <option key={r.id} value={r.name} />
        ))}
      </datalist>
      {isResolved && (
        <span className="chip bg-emerald-500/15 text-emerald-700">resolved → #{attendee.invitedById}</span>
      )}
      {!isResolved && hasText && (
        <span className="chip bg-amber-500/15 text-amber-700">unresolved</span>
      )}
    </div>
  );
}

function BatchEventsPreview({
  events,
  onChange,
  onCommit,
  pending,
}: {
  events: EventDraft[];
  onChange: (events: EventDraft[]) => void;
  onCommit: () => void;
  pending: boolean;
}) {
  const update = (i: number, patch: Partial<EventDraft>) =>
    onChange(events.map((x, idx) => (idx === i ? { ...x, ...patch } : x)));
  const remove = (i: number) => onChange(events.filter((_, idx) => idx !== i));

  const allValid = events.length > 0 && events.every((e) => e.name?.trim() && e.date);

  return (
    <div className="space-y-3 pt-3 border-t border-black/5 dark:border-white/10">
      <div className="label">Proposed events ({events.length})</div>
      {events.length === 0 && (
        <p className="text-sm text-black/50">Nothing found.</p>
      )}
      {events.map((ev, i) => (
        <div key={i} className="rounded-lg border border-black/10 dark:border-white/10 p-3 space-y-2">
          <div className="flex items-center justify-between">
            <span className="chip">#{i + 1}</span>
            <button onClick={() => remove(i)} className="text-xs text-black/40 hover:text-red-600">drop</button>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-4 gap-2">
            <input
              className="input md:col-span-2"
              placeholder="Name"
              value={ev.name}
              onChange={(e) => update(i, { name: e.target.value })}
            />
            <input
              className="input"
              type="date"
              value={ev.date}
              onChange={(e) => update(i, { date: e.target.value })}
            />
            <input
              className="input"
              placeholder="Type"
              value={ev.type ?? ""}
              onChange={(e) => update(i, { type: e.target.value })}
            />
            <input
              className="input md:col-span-4"
              placeholder="Location"
              value={ev.location ?? ""}
              onChange={(e) => update(i, { location: e.target.value })}
            />
          </div>
        </div>
      ))}
      <div className="flex justify-end">
        <button className="btn-primary" disabled={pending || !allValid} onClick={onCommit}>
          {pending ? "Saving…" : `Create ${events.length} event${events.length === 1 ? "" : "s"}`}
        </button>
      </div>
    </div>
  );
}
