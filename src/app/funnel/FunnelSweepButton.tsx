"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

export default function FunnelSweepButton() {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<string>("");

  const run = () => {
    setMsg("");
    start(async () => {
      try {
        const r = await fetch("/api/funnel/sweep", { method: "POST" });
        const data = await r.json();
        if (!r.ok) throw new Error(data.error ?? "Sweep failed");
        setMsg(`Flipped ${data.flipped.length} → inactive (evaluated ${data.evaluated})`);
        router.refresh();
      } catch (e) {
        setMsg(e instanceof Error ? e.message : "Sweep failed");
      }
    });
  };

  return (
    <div className="flex items-center gap-3">
      {msg && <span className="text-xs text-black/60">{msg}</span>}
      <button className="btn-ghost" onClick={run} disabled={pending}>
        {pending ? "Sweeping…" : "Run inactive sweep"}
      </button>
    </div>
  );
}
