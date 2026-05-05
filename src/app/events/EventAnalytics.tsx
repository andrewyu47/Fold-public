"use client";

import { useEffect, useState } from "react";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
} from "recharts";
import type { EventAggregates } from "@/lib/event-features";
import type { TopInviter } from "@/lib/health-metrics";

export default function EventAnalytics({
  aggregates,
  topInviters = [],
}: {
  aggregates: EventAggregates;
  topInviters?: TopInviter[];
}) {
  return (
    <section className="card space-y-4 border-accent/20">
      <div>
        <h2 className="font-semibold">📊 What's driving attendance?</h2>
        <p className="text-xs text-black/60">
          {aggregates.totalEvents} events · avg {aggregates.avgAttendance.toFixed(1)} attendees · {aggregates.totalAttendance} total check-ins.
        </p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {aggregates.food && (
          <PairCompare
            title="Free food vs none"
            caveat="heuristic: event/notes mention food keywords"
            a={{ label: "with food", avg: aggregates.food.withFood.avg, n: aggregates.food.withFood.n }}
            b={{ label: "without food", avg: aggregates.food.withoutFood.avg, n: aggregates.food.withoutFood.n }}
          />
        )}
        {aggregates.campus && (
          <PairCompare
            title="On vs off campus"
            caveat="heuristic: location mentions campus or street address"
            a={{ label: "on campus", avg: aggregates.campus.onCampus.avg, n: aggregates.campus.onCampus.n }}
            b={{ label: "off campus", avg: aggregates.campus.offCampus.avg, n: aggregates.campus.offCampus.n }}
          />
        )}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
        <MiniBar title="Avg attendance by day of week" data={aggregates.byDay} />
        <MiniBar title="Avg attendance by month" data={aggregates.byMonth} />
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <EventList title="Top events" rows={aggregates.topEvents} />
        <EventList title="Lowest-turnout events" rows={aggregates.bottomEvents} />
      </div>

      {aggregates.invite && (
        <InviteSection invite={aggregates.invite} topInviters={topInviters} />
      )}

      <InsightsPanel aggregates={aggregates} />
    </section>
  );
}

function PairCompare({
  title, caveat, a, b,
}: {
  title: string;
  caveat: string;
  a: { label: string; avg: number; n: number };
  b: { label: string; avg: number; n: number };
}) {
  const diff = a.avg - b.avg;
  return (
    <div className="rounded-lg border border-black/10 dark:border-white/10 p-3 space-y-1">
      <div className="text-sm font-medium">{title}</div>
      <div className="text-xs text-black/40">{caveat}</div>
      <div className="flex items-baseline gap-2 text-sm">
        <span className="font-mono tabular-nums">{a.avg.toFixed(1)}</span>
        <span className="text-black/50">{a.label} ({a.n})</span>
        <span className="text-black/30">vs</span>
        <span className="font-mono tabular-nums">{b.avg.toFixed(1)}</span>
        <span className="text-black/50">{b.label} ({b.n})</span>
      </div>
      <div className={`text-xs ${diff >= 0 ? "text-emerald-600" : "text-red-600"}`}>
        {diff >= 0 ? "+" : ""}{diff.toFixed(1)} avg attendees
      </div>
    </div>
  );
}

function MiniBar({ title, data }: { title: string; data: { key: string; avg: number; n: number }[] }) {
  return (
    <div className="rounded-lg border border-black/10 dark:border-white/10 p-3">
      <div className="text-sm font-medium mb-2">{title}</div>
      {data.length === 0 ? (
        <div className="text-xs text-black/40">no data</div>
      ) : (
        <ResponsiveContainer width="100%" height={160}>
          <BarChart data={data}>
            <CartesianGrid strokeDasharray="3 3" stroke="rgba(0,0,0,0.06)" />
            <XAxis dataKey="key" fontSize={11} />
            <YAxis fontSize={11} allowDecimals={false} />
            <Tooltip
              formatter={(v: number, _n, p: { payload?: { n?: number } }) =>
                [`${v.toFixed(1)} avg (${p.payload?.n ?? 0} events)`, "attendance"]
              }
            />
            <Bar dataKey="avg" fill="#7c3aed" />
          </BarChart>
        </ResponsiveContainer>
      )}
    </div>
  );
}

function EventList({ title, rows }: { title: string; rows: { name: string; date: string; count: number }[] }) {
  return (
    <div className="rounded-lg border border-black/10 dark:border-white/10 p-3">
      <div className="text-sm font-medium mb-2">{title}</div>
      {rows.length === 0 ? (
        <div className="text-xs text-black/40">no data</div>
      ) : (
        <ul className="text-sm space-y-1">
          {rows.map((r, i) => (
            <li key={i} className="flex justify-between gap-2">
              <span className="truncate">{r.name}</span>
              <span className="text-black/50 shrink-0">{r.count} · {r.date}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function InviteSection({
  invite,
  topInviters,
}: {
  invite: NonNullable<EventAggregates["invite"]>;
  topInviters: TopInviter[];
}) {
  const fmtRatio = (r: number) => `${(r * 100).toFixed(0)}%`;
  return (
    <div className="rounded-xl border border-accent/30 bg-accent/5 p-3 space-y-3">
      <div>
        <h3 className="font-medium">🪜 Invite-driven attendance</h3>
        <p className="text-xs text-black/60">
          Of new attendees ({invite.totalNew} across the period), {invite.totalInvitedNew} were
          tagged as &ldquo;brought by&rdquo; another student. Average per-event invite ratio: {fmtRatio(invite.avgInviteRatio)}.
        </p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {invite.byFood && (
          <InvitePair
            title="Invites: with vs without food"
            a={invite.byFood.withFood}
            b={invite.byFood.withoutFood}
          />
        )}
        {invite.byCampus && (
          <InvitePair
            title="Invites: on vs off campus"
            a={invite.byCampus.onCampus}
            b={invite.byCampus.offCampus}
          />
        )}
      </div>

      <InviteMonthBar data={invite.byMonth} />

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div className="rounded-lg border border-black/10 dark:border-white/10 p-3">
          <div className="text-sm font-medium mb-2">Top invite-driven events</div>
          {invite.topInviteEvents.length === 0 ? (
            <div className="text-xs text-black/40">no data — no events have invited new attendees yet</div>
          ) : (
            <ul className="text-sm space-y-1">
              {invite.topInviteEvents.map((e, i) => (
                <li key={i} className="flex justify-between gap-2">
                  <span className="truncate">{e.name}</span>
                  <span className="text-black/50 shrink-0">
                    {fmtRatio(e.ratio)} of {e.n} new · {e.date}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
        <div className="rounded-lg border border-black/10 dark:border-white/10 p-3">
          <div className="text-sm font-medium mb-2">Top inviters (last 90d)</div>
          {topInviters.length === 0 ? (
            <div className="text-xs text-black/40">no inviters yet — tag attendees with &ldquo;brought by&rdquo; in QuickAdd</div>
          ) : (
            <ul className="text-sm space-y-1">
              {topInviters.map((p) => (
                <li key={p.studentId} className="flex justify-between gap-2">
                  <span className="truncate">{p.name}</span>
                  <span className="text-black/50 shrink-0">
                    {p.count} brought · {p.tier}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}

function InvitePair({
  title,
  a,
  b,
}: {
  title: string;
  a: { key: string; events: number; avgInviteRatio: number };
  b: { key: string; events: number; avgInviteRatio: number };
}) {
  const fmt = (r: number) => `${(r * 100).toFixed(0)}%`;
  const diff = a.avgInviteRatio - b.avgInviteRatio;
  return (
    <div className="rounded-lg border border-black/10 dark:border-white/10 p-3 space-y-1">
      <div className="text-sm font-medium">{title}</div>
      <div className="text-xs text-black/40">avg invite ratio per event in each bucket</div>
      <div className="flex items-baseline gap-2 text-sm">
        <span className="font-mono tabular-nums">{fmt(a.avgInviteRatio)}</span>
        <span className="text-black/50">{a.key} ({a.events})</span>
        <span className="text-black/30">vs</span>
        <span className="font-mono tabular-nums">{fmt(b.avgInviteRatio)}</span>
        <span className="text-black/50">{b.key} ({b.events})</span>
      </div>
      <div className={`text-xs ${diff >= 0 ? "text-emerald-600" : "text-red-600"}`}>
        {diff >= 0 ? "+" : ""}{(diff * 100).toFixed(0)} pts
      </div>
    </div>
  );
}

function InviteMonthBar({ data }: { data: { key: string; events: number; avgInviteRatio: number }[] }) {
  return (
    <div className="rounded-lg border border-black/10 dark:border-white/10 p-3">
      <div className="text-sm font-medium mb-2">Invite ratio by month</div>
      {data.length === 0 ? (
        <div className="text-xs text-black/40">no data</div>
      ) : (
        <ResponsiveContainer width="100%" height={160}>
          <BarChart data={data}>
            <CartesianGrid strokeDasharray="3 3" stroke="rgba(0,0,0,0.06)" />
            <XAxis dataKey="key" fontSize={11} />
            <YAxis fontSize={11} domain={[0, 1]} tickFormatter={(v: number) => `${Math.round(v * 100)}%`} />
            <Tooltip
              formatter={(v: number, _n, p: { payload?: { events?: number } }) =>
                [`${(v * 100).toFixed(0)}% (${p.payload?.events ?? 0} events)`, "invite ratio"]
              }
            />
            <Bar dataKey="avgInviteRatio" fill="#7c3aed" />
          </BarChart>
        </ResponsiveContainer>
      )}
    </div>
  );
}

function InsightsPanel({ aggregates }: { aggregates: EventAggregates }) {
  const [insights, setInsights] = useState<{ headline: string; evidence: string }[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function fetchInsights() {
    setLoading(true);
    setError("");
    try {
      const r = await fetch("/api/event-insights", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ aggregates }),
      });
      const data = await r.json();
      if (!r.ok) throw new Error(data.error ?? "Failed");
      setInsights(data.insights);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    fetchInsights();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="rounded-lg border border-accent/30 bg-accent/5 p-3 space-y-2">
      <div className="flex items-center justify-between">
        <div className="text-sm font-medium">Insights</div>
        <button
          onClick={fetchInsights}
          disabled={loading}
          className="text-xs text-black/60 hover:underline disabled:opacity-50"
        >
          {loading ? "thinking…" : "regenerate"}
        </button>
      </div>
      {error && <p className="text-sm text-red-600">{error}</p>}
      {!insights && !error && (
        <p className="text-sm text-black/50">{loading ? "Thinking…" : "Waiting…"}</p>
      )}
      {insights && (
        <ul className="space-y-2">
          {insights.map((it, i) => (
            <li key={i} className="text-sm">
              <div className="font-medium">{it.headline}</div>
              <div className="text-xs text-black/60">{it.evidence}</div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
