import { redirect } from "next/navigation";
import StudentForm from "../[id]/StudentForm";
import { db } from "@/lib/db";
import { students } from "../../../../drizzle/schema";
import { parseStudent } from "@/lib/parse-student";

export default function NewStudentPage() {
  async function create(formData: FormData) {
    "use server";
    const data = parseStudent(formData);
    if (!data.firstName) redirect("/students/new");
    const [row] = await db.insert(students).values(data).returning();
    redirect(`/students/${row.id}`);
  }

  return (
    <div className="max-w-3xl mx-auto px-4 py-8 space-y-4">
      <h1 className="text-2xl font-semibold">New student</h1>
      <StudentForm action={create} />
    </div>
  );
}
