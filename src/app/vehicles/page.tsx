import Link from "next/link";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { vehicles } from "../../../drizzle/schema";
import { asc } from "drizzle-orm";
import { getCurrentUser } from "@/lib/auth";
import {
  createVehicleAction,
  updateVehicleAction,
  deleteVehicleAction,
} from "./actions";

export const dynamic = "force-dynamic";

export default async function VehiclesPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const rows = await db.select().from(vehicles).orderBy(asc(vehicles.name));

  return (
    <div className="max-w-4xl mx-auto px-4 py-8 space-y-6">
      <div className="flex items-baseline justify-between">
        <h1 className="text-2xl font-semibold tracking-tight">Vehicles</h1>
        <span className="text-sm text-black/60">{rows.length} total</span>
      </div>
      <p className="text-sm text-black/60">
        Capacity includes the driver seat. A 7-seat minivan = capacity 7.
      </p>

      <Link
        href="/rides"
        className="card flex items-center justify-between hover:bg-black/5 dark:hover:bg-white/5 transition"
      >
        <div>
          <div className="font-medium">Plan a ride session →</div>
          <div className="text-xs text-black/60">
            Already have your fleet set up? Pick an event to assign riders.
          </div>
        </div>
        <span className="text-xs text-black/40">→</span>
      </Link>

      <form action={createVehicleAction} className="card grid grid-cols-1 md:grid-cols-6 gap-3 items-end">
        <div className="space-y-1 md:col-span-3">
          <label className="label" htmlFor="name">Name</label>
          <input id="name" name="name" required className="input" placeholder="Team Lead's minivan" />
        </div>
        <div className="space-y-1 md:col-span-1">
          <label className="label" htmlFor="capacity">Capacity</label>
          <input id="capacity" name="capacity" type="number" min={2} max={20} required className="input" placeholder="7" />
        </div>
        <div className="space-y-1 md:col-span-2">
          <label className="label" htmlFor="notes">Notes</label>
          <input id="notes" name="notes" className="input" placeholder="optional" />
        </div>
        <button type="submit" className="btn-primary md:col-span-6">Add vehicle</button>
      </form>

      <div className="space-y-3">
        {rows.length === 0 && (
          <div className="card text-center text-black/50 py-6 text-sm">No vehicles yet.</div>
        )}
        {rows.map((v) => (
          <form key={v.id} action={updateVehicleAction} className="card grid grid-cols-1 md:grid-cols-6 gap-3 items-end">
            <input type="hidden" name="id" value={v.id} />
            <div className="space-y-1 md:col-span-3">
              <label className="label">Name</label>
              <input name="name" defaultValue={v.name} required className="input" />
            </div>
            <div className="space-y-1 md:col-span-1">
              <label className="label">Capacity</label>
              <input name="capacity" type="number" min={2} max={20} defaultValue={v.capacity} required className="input" />
            </div>
            <div className="space-y-1 md:col-span-2">
              <label className="label">Notes</label>
              <input name="notes" defaultValue={v.notes ?? ""} className="input" />
            </div>
            <label className="flex items-center gap-2 text-sm md:col-span-3">
              <input type="checkbox" name="isActive" defaultChecked={v.isActive} />
              Active
            </label>
            <div className="md:col-span-3 flex gap-2 justify-end">
              <button type="submit" className="btn-ghost">Save</button>
              <button
                type="submit"
                formAction={deleteVehicleAction}
                className="btn-danger"
              >
                Delete
              </button>
            </div>
          </form>
        ))}
      </div>
    </div>
  );
}
