"use client";

import { useMemo, useState, useTransition } from "react";
import type {
  FleetParsePreview,
  ParsedRider,
  ParsePreview,
  PreviewAssignment,
  PreviewViolation,
  PreviewWarning,
  VehicleInPlay,
} from "@/lib/rides/shared";

interface SavedVehicle {
  id: number;
  name: string;
  capacity: number;
}

interface Props {
  sessionId: number;
  initialEnforceRule: boolean;
  savedVehicles: SavedVehicle[];
  initialVehicles: VehicleInPlay[];
  initialRiders: ParsedRider[];
  initialAssignments: PreviewAssignment[];
  hasCommittedState: boolean;
}

export default function RideSessionEditor(props: Props) {
  const [enforceRule, setEnforceRule] = useState(false);
  const [vehicles, setVehicles] = useState<VehicleInPlay[]>(props.initialVehicles);
  const [text, setText] = useState("");
  const [riders, setRiders] = useState<ParsedRider[]>(props.initialRiders);
  const [assignments, setAssignments] = useState<PreviewAssignment[]>(props.initialAssignments);
  const [violations, setViolations] = useState<PreviewViolation[]>([]);
  const [warnings, setWarnings] = useState<PreviewWarning[]>([]);
  const [unsatisfiable, setUnsatisfiable] = useState<ParsePreview["unsatisfiable"]>([]);
  const [unassigned, setUnassigned] = useState<string[]>([]);
  const [ambiguous, setAmbiguous] = useState<string[]>([]);
  const [explanation, setExplanation] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [parsing, startParse] = useTransition();
  const [parsingFleet, startFleetParse] = useTransition();
  const [fleetExplanation, setFleetExplanation] = useState("");
  const [ambiguousVehicleNames, setAmbiguousVehicleNames] = useState<string[]>([]);
  const [committing, startCommit] = useTransition();
  const [committedAt, setCommittedAt] = useState<number | null>(props.hasCommittedState ? Date.now() : null);

  const ridersById = useMemo(() => new Map(riders.map((r) => [r.riderId, r])), [riders]);

  const addSavedVehicle = (id: number) => {
    const sv = props.savedVehicles.find((v) => v.id === id);
    if (!sv) return;
    if (vehicles.some((v) => v.vehicleId === id)) return;
    setVehicles((vs) => [
      ...vs,
      {
        vehicleId: sv.id,
        name: sv.name,
        capacity: sv.capacity,
        driverName: "",
        driverGender: undefined,
      },
    ]);
  };

  const addAdHocVehicle = () => {
    const tempId = -(Math.floor(Math.random() * 1_000_000) + 1); // negative = ad-hoc
    setVehicles((vs) => [
      ...vs,
      {
        vehicleId: tempId,
        name: `Ad-hoc ${vs.length + 1}`,
        capacity: 5,
        driverName: "",
      },
    ]);
  };

  const updateVehicle = (idx: number, patch: Partial<VehicleInPlay>) => {
    setVehicles((vs) => vs.map((v, i) => (i === idx ? { ...v, ...patch } : v)));
  };

  const removeVehicle = (idx: number) => {
    setVehicles((vs) => vs.filter((_, i) => i !== idx));
  };

  const runFleetParse = (mode: "replace" | "append") => {
    setError(null);
    if (!text.trim()) {
      setError("Type a description first (e.g. \"Sienna with Mike driving, Civic with Sarah\").");
      return;
    }
    startFleetParse(async () => {
      try {
        const res = await fetch("/api/rides/parse-fleet", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ text }),
        });
        if (!res.ok) {
          const j = await res.json().catch(() => ({}));
          setError(j.error ?? `Fleet parse failed (${res.status})`);
          return;
        }
        const data = (await res.json()) as FleetParsePreview;
        if (data.vehicles.length === 0) {
          setError("No vehicles found in that text.");
          setAmbiguousVehicleNames(data.ambiguousVehicleNames);
          return;
        }
        setVehicles((existing) => {
          if (mode === "replace") return data.vehicles;
          const seenSavedIds = new Set(existing.filter((v) => v.vehicleId > 0).map((v) => v.vehicleId));
          const additions = data.vehicles.filter(
            (v) => v.vehicleId < 0 || !seenSavedIds.has(v.vehicleId)
          );
          return [...existing, ...additions];
        });
        setFleetExplanation(data.explanation);
        setAmbiguousVehicleNames(data.ambiguousVehicleNames);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Network error");
      }
    });
  };

  const runParse = () => {
    setError(null);
    if (vehicles.length === 0) {
      setError("Add at least one vehicle.");
      return;
    }
    if (vehicles.some((v) => !v.driverName.trim())) {
      setError("Every vehicle needs a driver name.");
      return;
    }
    if (!text.trim()) {
      setError("Paste a rider list or natural-language hint first.");
      return;
    }

    startParse(async () => {
      try {
        const res = await fetch("/api/rides/parse", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            sessionId: props.sessionId,
            text,
            vehicles,
            enforceGenderRule: enforceRule,
          }),
        });
        if (!res.ok) {
          const j = await res.json().catch(() => ({}));
          setError(j.error ?? `Parse failed (${res.status})`);
          return;
        }
        const data = (await res.json()) as ParsePreview;
        setRiders(data.riders);
        setAssignments(data.assignments);
        setViolations(data.violations);
        setWarnings(data.warnings);
        setUnsatisfiable(data.unsatisfiable);
        setUnassigned(data.unassigned);
        setAmbiguous(data.ambiguous);
        setExplanation(data.explanation);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Network error");
      }
    });
  };

  const runValidate = async (next: PreviewAssignment[]) => {
    try {
      const res = await fetch("/api/rides/validate", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          riders,
          vehicles,
          assignments: next,
          enforceGenderRule: enforceRule,
        }),
      });
      if (!res.ok) return;
      const data = (await res.json()) as { violations: PreviewViolation[]; warnings: PreviewWarning[] };
      setViolations(data.violations);
      setWarnings(data.warnings);
    } catch {
      // ignore — user can manually re-parse
    }
  };

  const moveRider = (riderId: string, toVehicleId: number | "unassigned") => {
    setAssignments((prev) => {
      const next = prev.map((a) => ({
        vehicleId: a.vehicleId,
        riderIds: a.riderIds.filter((rid) => rid !== riderId),
      }));
      if (toVehicleId !== "unassigned") {
        const target = next.find((a) => a.vehicleId === toVehicleId);
        if (target) target.riderIds.push(riderId);
        else next.push({ vehicleId: toVehicleId, riderIds: [riderId] });
      }
      // Update unassigned bucket
      const allPlaced = new Set(next.flatMap((a) => a.riderIds));
      setUnassigned(riders.map((r) => r.riderId).filter((id) => !allPlaced.has(id)));
      runValidate(next);
      return next;
    });
  };

  const commit = () => {
    setError(null);
    startCommit(async () => {
      try {
        const res = await fetch("/api/rides/commit", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            sessionId: props.sessionId,
            enforceGenderRule: enforceRule,
            vehicles,
            riders,
            assignments,
          }),
        });
        if (!res.ok) {
          const j = await res.json().catch(() => ({}));
          setError(j.error ?? `Commit failed (${res.status})`);
          return;
        }
        setCommittedAt(Date.now());
      } catch (e) {
        setError(e instanceof Error ? e.message : "Network error");
      }
    });
  };

  const violationsByVehicle = useMemo(() => {
    const map = new Map<number, PreviewViolation[]>();
    for (const v of violations) {
      const list = map.get(v.vehicleId) ?? [];
      list.push(v);
      map.set(v.vehicleId, list);
    }
    return map;
  }, [violations]);

  const warningsByVehicle = useMemo(() => {
    const map = new Map<number, PreviewWarning[]>();
    for (const w of warnings) {
      const list = map.get(w.vehicleId) ?? [];
      list.push(w);
      map.set(w.vehicleId, list);
    }
    return map;
  }, [warnings]);

  const hasPreview = riders.length > 0 || assignments.length > 0;

  return (
    <div className="space-y-6">
      <section className="card space-y-3">
        <div className="flex items-baseline justify-between">
          <h2 className="text-lg font-semibold">Vehicles in play</h2>
          <div className="flex items-center gap-2">
            <select
              className="input max-w-xs"
              defaultValue=""
              onChange={(e) => {
                const id = Number(e.target.value);
                if (Number.isFinite(id) && id > 0) addSavedVehicle(id);
                e.target.value = "";
              }}
            >
              <option value="">+ add saved vehicle</option>
              {props.savedVehicles
                .filter((sv) => !vehicles.some((v) => v.vehicleId === sv.id))
                .map((sv) => (
                  <option key={sv.id} value={sv.id}>
                    {sv.name} (cap {sv.capacity})
                  </option>
                ))}
            </select>
            <button type="button" className="btn-ghost" onClick={addAdHocVehicle}>
              + ad-hoc
            </button>
            <button
              type="button"
              className="btn-ghost"
              onClick={() => runFleetParse(vehicles.length === 0 ? "replace" : "append")}
              disabled={parsingFleet}
              title="Read vehicles + drivers from the text below"
            >
              {parsingFleet ? "Parsing fleet…" : vehicles.length === 0 ? "↓ from text" : "+ from text"}
            </button>
          </div>
        </div>
        {vehicles.length === 0 && (
          <div className="text-sm text-black/60">
            Add a saved vehicle, an ad-hoc, or paste a description below and click <em>↓ from text</em>.
          </div>
        )}
        {fleetExplanation && (
          <div className="text-xs text-black/60">{fleetExplanation}</div>
        )}
        {ambiguousVehicleNames.length > 0 && (
          <div className="text-xs text-amber-700 dark:text-amber-300">
            Ambiguous vehicles (skipped): {ambiguousVehicleNames.join(", ")}
          </div>
        )}
        <div className="space-y-2">
          {vehicles.map((v, idx) => (
            <div key={`${v.vehicleId}-${idx}`} className="grid grid-cols-1 md:grid-cols-12 gap-2 items-end border border-black/5 dark:border-white/10 rounded-lg p-3">
              <div className="space-y-1 md:col-span-3">
                <label className="label">Name</label>
                <input
                  className="input"
                  value={v.name}
                  onChange={(e) => updateVehicle(idx, { name: e.target.value })}
                />
              </div>
              <div className="space-y-1 md:col-span-1">
                <label className="label">Cap</label>
                <input
                  type="number"
                  className="input"
                  min={2}
                  max={20}
                  value={v.capacity}
                  onChange={(e) => updateVehicle(idx, { capacity: Number(e.target.value) || 2 })}
                />
              </div>
              <div className="space-y-1 md:col-span-3">
                <label className="label">Driver</label>
                <input
                  className="input"
                  value={v.driverName}
                  onChange={(e) => updateVehicle(idx, { driverName: e.target.value })}
                  placeholder="Team Lead"
                />
              </div>
              <div className="space-y-1 md:col-span-2">
                <label className="label">Driver gender</label>
                <select
                  className="input"
                  value={v.driverGender ?? ""}
                  onChange={(e) =>
                    updateVehicle(idx, {
                      driverGender: e.target.value === "M" || e.target.value === "F"
                        ? (e.target.value as "M" | "F")
                        : undefined,
                    })
                  }
                >
                  <option value="">unknown</option>
                  <option value="M">M</option>
                  <option value="F">F</option>
                </select>
              </div>
              <div className="md:col-span-3 flex justify-end">
                <button type="button" className="btn-ghost text-red-600" onClick={() => removeVehicle(idx)}>
                  Remove
                </button>
              </div>
            </div>
          ))}
        </div>
      </section>

      <section className="card space-y-3">
        <h2 className="text-lg font-semibold">Riders &amp; instructions</h2>
        <p className="text-xs text-black/60">
          Describe the whole night in plain English. Vehicles + drivers can be pulled out via <em>↓ from text</em> above; riders and rules go through <em>Parse &amp; place</em> below. e.g. <em>&quot;Sienna with Jordan driving, Civic with Alex. Riders: Sam (new freshman bro), Taylor, Morgan, Riley. Put Sam with Alex, balance freshmen.&quot;</em>
        </p>
        <textarea
          className="input min-h-[120px]"
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="Alex, Jordan, Sam (new freshman bro), Taylor, Morgan, Riley. Put Jordan with Alex, balance the freshmen."
        />
        <div className="flex items-center gap-3">
          <button type="button" className="btn-primary" onClick={runParse} disabled={parsing}>
            {parsing ? "Parsing…" : hasPreview ? "Re-parse" : "Parse &amp; place"}
          </button>
          {error && <div className="text-sm text-red-600">{error}</div>}
          {explanation && !error && (
            <div className="text-xs text-black/60">{explanation}</div>
          )}
        </div>
      </section>

      {hasPreview && (
        <>
          {ambiguous.length > 0 && (
            <section className="card border-amber-300/50">
              <div className="text-sm font-medium text-amber-700 dark:text-amber-200">Ambiguous names</div>
              <div className="text-xs text-black/60 mt-1">
                These didn&apos;t match exactly one student — add or rename them in Students, then re-parse.
              </div>
              <ul className="mt-2 flex flex-wrap gap-2">
                {ambiguous.map((a) => (
                  <li key={a} className="chip-warn">{a}</li>
                ))}
              </ul>
            </section>
          )}

          {unsatisfiable.length > 0 && (
            <section className="card border-red-300/50">
              <div className="text-sm font-medium text-red-700 dark:text-red-200">Can&apos;t be satisfied</div>
              <ul className="mt-2 list-disc list-inside text-sm">
                {unsatisfiable.map((u, i) => <li key={i}>{u.message}</li>)}
              </ul>
            </section>
          )}

          <section className="space-y-3">
            <div className="flex items-baseline justify-between">
              <h2 className="text-lg font-semibold">Proposed seating</h2>
              <button
                type="button"
                onClick={commit}
                className="btn-primary"
                disabled={committing || violations.length > 0}
                title={violations.length > 0 ? "Fix violations before committing" : ""}
              >
                {committing ? "Saving…" : committedAt ? "Save changes" : "Commit"}
              </button>
            </div>
            {committedAt && (
              <div className="text-xs text-black/60">Last saved: {new Date(committedAt).toLocaleTimeString()}</div>
            )}

            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {vehicles.map((v) => {
                const a = assignments.find((x) => x.vehicleId === v.vehicleId) ?? {
                  vehicleId: v.vehicleId,
                  riderIds: [],
                };
                const occCount = a.riderIds.length + 1; // +1 driver
                const seatsLeft = v.capacity - occCount;
                const vViolations = violationsByVehicle.get(v.vehicleId) ?? [];
                const vWarnings = warningsByVehicle.get(v.vehicleId) ?? [];

                return (
                  <div key={v.vehicleId} className="card space-y-2">
                    <div className="flex items-baseline justify-between">
                      <div>
                        <div className="font-medium">{v.name}</div>
                        <div className="text-xs text-black/60">
                          Driver: {v.driverName || "—"}
                          {v.driverGender ? ` (${v.driverGender})` : ""} • {occCount}/{v.capacity}
                          {seatsLeft > 0 ? ` • ${seatsLeft} seat${seatsLeft === 1 ? "" : "s"} left` : seatsLeft < 0 ? " • OVER" : " • full"}
                        </div>
                      </div>
                      {vViolations.map((vio, i) => (
                        <span key={i} className="chip-error">{vio.kind}</span>
                      ))}
                      {vWarnings.length > 0 && vViolations.length === 0 && (
                        <span className="chip-warn">warning</span>
                      )}
                    </div>

                    <ul className="space-y-1">
                      {a.riderIds.length === 0 && (
                        <li className="text-xs text-black/40 italic">empty</li>
                      )}
                      {a.riderIds.map((rid) => {
                        const r = ridersById.get(rid);
                        return (
                          <li key={rid} className="flex items-center justify-between gap-2 text-sm">
                            <span>
                              {r?.displayName ?? rid}
                              {r?.gender ? <span className="text-xs text-black/40 ml-1">({r.gender})</span> : null}
                              {r?.match === "new" ? <span className="chip ml-1">new</span> : null}
                            </span>
                            <select
                              className="text-xs bg-transparent border border-black/10 dark:border-white/10 rounded px-1 py-0.5"
                              value={v.vehicleId}
                              onChange={(e) => {
                                const val = e.target.value;
                                if (val === "unassigned") moveRider(rid, "unassigned");
                                else moveRider(rid, Number(val));
                              }}
                            >
                              {vehicles.map((vv) => (
                                <option key={vv.vehicleId} value={vv.vehicleId}>{vv.name}</option>
                              ))}
                              <option value="unassigned">— unassigned —</option>
                            </select>
                          </li>
                        );
                      })}
                    </ul>

                    {(vViolations.length > 0 || vWarnings.length > 0) && (
                      <ul className="text-xs space-y-1 pt-2 border-t border-black/5 dark:border-white/10">
                        {vViolations.map((vio, i) => (
                          <li key={`v${i}`} className="text-red-700 dark:text-red-300">{vio.message}</li>
                        ))}
                        {vWarnings.map((w, i) => (
                          <li key={`w${i}`} className="text-amber-700 dark:text-amber-300">{w.message}</li>
                        ))}
                      </ul>
                    )}
                  </div>
                );
              })}
            </div>

            <div className="card">
              <div className="text-sm font-medium">Unassigned</div>
              {unassigned.length === 0 ? (
                <div className="text-xs text-black/40 mt-1">none — everyone has a seat.</div>
              ) : (
                <ul className="mt-2 space-y-1">
                  {unassigned.map((rid) => {
                    const r = ridersById.get(rid);
                    return (
                      <li key={rid} className="flex items-center justify-between text-sm">
                        <span>
                          {r?.displayName ?? rid}
                          {r?.gender ? <span className="text-xs text-black/40 ml-1">({r.gender})</span> : null}
                          {r?.match === "new" ? <span className="chip ml-1">new</span> : null}
                        </span>
                        <select
                          className="text-xs bg-transparent border border-black/10 dark:border-white/10 rounded px-1 py-0.5"
                          value=""
                          onChange={(e) => {
                            const val = e.target.value;
                            if (!val) return;
                            moveRider(rid, Number(val));
                          }}
                        >
                          <option value="">place in…</option>
                          {vehicles.map((vv) => (
                            <option key={vv.vehicleId} value={vv.vehicleId}>{vv.name}</option>
                          ))}
                        </select>
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
          </section>
        </>
      )}
    </div>
  );
}
