export function parseStudent(f: FormData) {
  const v = (k: string) => {
    const x = f.get(k);
    return x == null || x === "" ? null : String(x);
  };
  const b = (k: string) => f.get(k) === "on";
  const invitedRaw = v("invitedByStudentId");
  const invitedNum = invitedRaw == null ? null : Number(invitedRaw);
  return {
    firstName: v("firstName") ?? "",
    lastName: v("lastName"),
    studentId: v("studentId"),
    gender: (v("gender") as "M" | "F" | null) ?? null,
    year: (v("year") as never) ?? null,
    phone: v("phone"),
    email: v("email"),
    igHandle: v("igHandle")?.replace(/^@/, "") ?? null,
    isActive: b("isActive"),
    contactedViaIg: b("contactedViaIg"),
    primaryContact: v("primaryContact"),
    goals: v("goals"),
    notes: v("notes"),
    courseMaterial: f.getAll("courseMaterial").map(String).filter(Boolean),
    invitedByStudentId: invitedNum != null && Number.isFinite(invitedNum) ? invitedNum : null,
  };
}
