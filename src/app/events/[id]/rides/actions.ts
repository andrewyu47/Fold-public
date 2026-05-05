"use server";

import { db } from "@/lib/db";
import { rideSessions } from "../../../../../drizzle/schema";
import { eq } from "drizzle-orm";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/auth";

export async function createRideSessionAction(formData: FormData) {
  const user = await requireUser();
  const eventId = Number(formData.get("eventId"));
  const label = String(formData.get("label") || "").trim() || "Rides";
  if (!Number.isFinite(eventId)) redirect("/events");
  const [row] = await db
    .insert(rideSessions)
    .values({ eventId, label, recordedBy: user.id })
    .returning();
  revalidatePath(`/events/${eventId}/rides`);
  redirect(`/events/${eventId}/rides/${row.id}`);
}

export async function deleteRideSessionAction(formData: FormData) {
  await requireUser();
  const eventId = Number(formData.get("eventId"));
  const sessionId = Number(formData.get("sessionId"));
  if (!Number.isFinite(sessionId) || !Number.isFinite(eventId)) redirect("/events");
  await db.delete(rideSessions).where(eq(rideSessions.id, sessionId));
  revalidatePath(`/events/${eventId}/rides`);
  redirect(`/events/${eventId}/rides`);
}
