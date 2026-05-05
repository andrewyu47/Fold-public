"use server";

import { destroySession } from "@/lib/auth";
import { redirect } from "next/navigation";

export async function destroySessionAction() {
  await destroySession();
  redirect("/login");
}
