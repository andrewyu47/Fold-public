import type { Student } from "../../../../drizzle/schema";

export default function StudentForm({
  action,
  student,
  roster = [],
}: {
  action: (fd: FormData) => Promise<void>;
  student?: Student;
  roster?: { id: number; name: string }[];
}) {
  const s = student ?? ({} as Partial<Student>);
  return (
    <form action={action} className="card space-y-5">
      <div className="grid grid-cols-2 gap-3">
        <Field label="First name" name="firstName" defaultValue={s.firstName ?? ""} required />
        <Field label="Last name" name="lastName" defaultValue={s.lastName ?? ""} />
      </div>
      <div className="grid grid-cols-3 gap-3">
        <Field label="Student ID" name="studentId" defaultValue={s.studentId ?? ""} />
        <Select label="Gender" name="gender" defaultValue={s.gender ?? ""} options={[["", "—"], ["M", "Male"], ["F", "Female"]]} />
        <Select
          label="Year"
          name="year"
          defaultValue={s.year ?? ""}
          options={[
            ["", "—"], ["freshman", "Freshman"], ["sophomore", "Sophomore"],
            ["junior", "Junior"], ["senior", "Senior"], ["grad", "Grad"], ["other", "Other"],
          ]}
        />
      </div>
      <div className="grid grid-cols-3 gap-3">
        <Field label="Phone" name="phone" defaultValue={s.phone ?? ""} />
        <Field label="Email" name="email" type="email" defaultValue={s.email ?? ""} />
        <Field label="IG handle" name="igHandle" defaultValue={s.igHandle ?? ""} placeholder="(without @)" />
      </div>
      <div className="grid grid-cols-2 gap-3 items-end">
        <Checkbox label="Is active" name="isActive" defaultChecked={s.isActive ?? true} />
        <Checkbox label="Contacted via IG" name="contactedViaIg" defaultChecked={s.contactedViaIg ?? false} />
      </div>
      <Field label="Primary contact (leader/friend)" name="primaryContact" defaultValue={s.primaryContact ?? ""} />
      <label className="block space-y-1">
        <span className="label">Invited by (existing student)</span>
        <select name="invitedByStudentId" defaultValue={s.invitedByStudentId ?? ""} className="input">
          <option value="">—</option>
          {roster
            .filter((r) => r.id !== s.id)
            .map((r) => (
              <option key={r.id} value={r.id}>
                {r.name}
              </option>
            ))}
        </select>
      </label>
      <Textarea label="Goals" name="goals" defaultValue={s.goals ?? ""} />
      <Textarea label="Notes" name="notes" defaultValue={s.notes ?? ""} />
      <CourseChecks defaultValues={(s.courseMaterial as string[] | undefined) ?? []} />
      <div className="flex justify-end">
        <button className="btn-primary" type="submit">Save</button>
      </div>
    </form>
  );
}

function Field(props: React.InputHTMLAttributes<HTMLInputElement> & { label: string }) {
  const { label, ...rest } = props;
  return (
    <label className="block space-y-1">
      <span className="label">{label}</span>
      <input className="input" {...rest} />
    </label>
  );
}

function Textarea(props: React.TextareaHTMLAttributes<HTMLTextAreaElement> & { label: string }) {
  const { label, ...rest } = props;
  return (
    <label className="block space-y-1">
      <span className="label">{label}</span>
      <textarea rows={3} className="input" {...rest} />
    </label>
  );
}

function Select({
  label,
  name,
  defaultValue,
  options,
}: {
  label: string;
  name: string;
  defaultValue?: string;
  options: [string, string][];
}) {
  return (
    <label className="block space-y-1">
      <span className="label">{label}</span>
      <select name={name} defaultValue={defaultValue} className="input">
        {options.map(([v, l]) => (
          <option key={v} value={v}>{l}</option>
        ))}
      </select>
    </label>
  );
}

function Checkbox({ label, name, defaultChecked }: { label: string; name: string; defaultChecked?: boolean }) {
  return (
    <label className="flex items-center gap-2 text-sm">
      <input type="checkbox" name={name} defaultChecked={defaultChecked} className="h-4 w-4" />
      <span>{label}</span>
    </label>
  );
}

const COURSES = ["Orientation", "Study Group 101", "Community Bootcamp", "Leadership Track"];

function CourseChecks({ defaultValues }: { defaultValues: string[] }) {
  return (
    <div className="space-y-2">
      <span className="label">Course material completed</span>
      <div className="grid grid-cols-2 gap-2">
        {COURSES.map((c) => (
          <label key={c} className="flex items-center gap-2 text-sm">
            <input type="checkbox" name="courseMaterial" value={c} defaultChecked={defaultValues.includes(c)} className="h-4 w-4" />
            <span>{c}</span>
          </label>
        ))}
      </div>
    </div>
  );
}
