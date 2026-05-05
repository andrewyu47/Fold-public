"use server";

import { db } from "@/lib/db";
import { vehicles } from "../../../drizzle/schema";
import { eq } from "drizzle-orm";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/auth";

function nullableStr(v: FormDataEntryValue | null): string | null {
  const s = String(v ?? "").trim();
  return s.length === 0 ? null : s;
}

export async function createVehicleAction(formData: FormData) {
  await requireUser();
  const name = String(formData.get("name") || "").trim();
  const capacity = Number(formData.get("capacity"));
  if (!name || !Number.isFinite(capacity) || capacity < 2) {
    redirect("/vehicles?error=invalid");
  }
  await db.insert(vehicles).values({
    name,
    capacity: Math.floor(capacity),
    notes: nullableStr(formData.get("notes")),
  });
  revalidatePath("/vehicles");
  redirect("/vehicles");
}

export async function updateVehicleAction(formData: FormData) {
  await requireUser();
  const id = Number(formData.get("id"));
  if (!Number.isFinite(id)) redirect("/vehicles");
  const name = String(formData.get("name") || "").trim();
  const capacity = Number(formData.get("capacity"));
  if (!name || !Number.isFinite(capacity) || capacity < 2) {
    redirect("/vehicles?error=invalid");
  }
  await db
    .update(vehicles)
    .set({
      name,
      capacity: Math.floor(capacity),
      notes: nullableStr(formData.get("notes")),
      isActive: formData.get("isActive") === "on",
    })
    .where(eq(vehicles.id, id));
  revalidatePath("/vehicles");
  redirect("/vehicles");
}

export async function deleteVehicleAction(formData: FormData) {
  await requireUser();
  const id = Number(formData.get("id"));
  if (!Number.isFinite(id)) redirect("/vehicles");
  await db.delete(vehicles).where(eq(vehicles.id, id));
  revalidatePath("/vehicles");
  redirect("/vehicles");
}
