"use client";

import { useState, useEffect } from "react";

interface Stats {
  total: number;
  firstTimers: number;
  returners: number;
  genderSplit: { M: number; F: number; unknown: number };
  inviteChains: { inviter: string; invitees: string[] }[];
}

export default function EventInsights({ eventId, stats }: { eventId: number; stats: Stats }) {
  const [insights, setInsights] = useState<{ headline: string; evidence: string }[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function fetchInsights() {
    setLoading(true);
    setError("");
    try {
      const r = await fetch("/api/event-insights/single", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ eventId, stats }),
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
    <div className="space-y-4">
      {/* Stats cards */}
      <div className="grid grid-cols-3 gap-3">
        <div className="card text-center">
          <div className="text-2xl font-semibold">{stats.firstTimers}</div>
          <div className="text-xs text-black/60">First-timers</div>
        </div>
        <div className="card text-center">
          <div className="text-2xl font-semibold">{stats.returners}</div>
          <div className="text-xs text-black/60">Returners</div>
        </div>
        <div className="card text-center">
          <div className="text-2xl font-semibold">
            {stats.genderSplit.M}M / {stats.genderSplit.F}F
            {stats.genderSplit.unknown > 0 && (
              <span className="text-sm text-black/40"> +{stats.genderSplit.unknown}</span>
            )}
          </div>
          <div className="text-xs text-black/60">Gender split</div>
        </div>
      </div>

      {/* Invite chains */}
      {stats.inviteChains.length > 0 && (
        <div className="card">
          <h3 className="text-sm font-medium mb-2">Invite chains</h3>
          <ul className="space-y-1">
            {stats.inviteChains.map((chain, i) => (
              <li key={i} className="text-sm">
                <span className="font-medium">{chain.inviter}</span>
                <span className="text-black/60"> brought </span>
                {chain.invitees.map((name, j) => (
                  <span key={j}>
                    {j > 0 && ", "}
                    <span className="chip">{name}</span>
                  </span>
                ))}
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* AI insights */}
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
    </div>
  );
}
