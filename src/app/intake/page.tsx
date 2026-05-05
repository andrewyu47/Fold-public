import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import IntakeDumper from "./IntakeDumper";

export const dynamic = "force-dynamic";

export default async function IntakePage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  return (
    <div className="max-w-4xl mx-auto px-4 py-8 space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Intake</h1>
        <p className="text-sm text-black/60 mt-1">
          Paste names, who you met, where, and any contact attempt. We'll sort possible
          duplicates from other leaders, you confirm, then commit.
        </p>
      </div>
      <IntakeDumper />
    </div>
  );
}
