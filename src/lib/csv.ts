export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cur = "";
  let inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') {
          cur += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        cur += c;
      }
    } else {
      if (c === '"') {
        inQuotes = true;
      } else if (c === ",") {
        row.push(cur);
        cur = "";
      } else if (c === "\n" || c === "\r") {
        if (c === "\r" && text[i + 1] === "\n") i++;
        row.push(cur);
        rows.push(row);
        row = [];
        cur = "";
      } else {
        cur += c;
      }
    }
  }
  if (cur.length || row.length) {
    row.push(cur);
    rows.push(row);
  }
  return rows.filter((r) => r.length > 1 || (r.length === 1 && r[0].trim().length > 0));
}

export const SCHEMA_FIELDS = [
  "firstName",
  "lastName",
  "studentId",
  "gender",
  "year",
  "phone",
  "email",
  "igHandle",
  "isActive",
  "contactedViaIg",
  "primaryContact",
  "goals",
  "notes",
] as const;

export type SchemaField = (typeof SCHEMA_FIELDS)[number] | "skip";

const NORMALIZE: Record<string, SchemaField> = {
  first: "firstName",
  firstname: "firstName",
  first_name: "firstName",
  last: "lastName",
  lastname: "lastName",
  last_name: "lastName",
  name: "firstName",
  studentid: "studentId",
  student_id: "studentId",
  id: "studentId",
  gender: "gender",
  sex: "gender",
  year: "year",
  grade: "year",
  classyear: "year",
  phone: "phone",
  phonenumber: "phone",
  mobile: "phone",
  email: "email",
  ig: "igHandle",
  insta: "igHandle",
  instagram: "igHandle",
  ighandle: "igHandle",
  ig_handle: "igHandle",
  active: "isActive",
  isactive: "isActive",
  contactedig: "contactedViaIg",
  contactedviaig: "contactedViaIg",
  contact: "primaryContact",
  primarycontact: "primaryContact",
  primary_contact: "primaryContact",
  leader: "primaryContact",
  goals: "goals",
  notes: "notes",
  comment: "notes",
  comments: "notes",
};

export function autoMap(headers: string[]): SchemaField[] {
  return headers.map((h) => {
    const k = h.toLowerCase().replace(/[\s_-]+/g, "");
    return NORMALIZE[k] ?? "skip";
  });
}

export function coerce(field: SchemaField, raw: string): unknown {
  const v = raw?.trim() ?? "";
  if (!v) return null;
  switch (field) {
    case "gender": {
      const u = v.toUpperCase();
      if (u.startsWith("M")) return "M";
      if (u.startsWith("F") || u.startsWith("W")) return "F";
      return null;
    }
    case "year": {
      const u = v.toLowerCase();
      if (u.includes("fresh") || u === "1") return "freshman";
      if (u.includes("soph") || u === "2") return "sophomore";
      if (u.includes("jun") || u === "3") return "junior";
      if (u.includes("sen") || u === "4") return "senior";
      if (u.includes("grad")) return "grad";
      return "other";
    }
    case "isActive":
    case "contactedViaIg": {
      const u = v.toLowerCase();
      return u === "y" || u === "yes" || u === "true" || u === "1" || u === "✓";
    }
    case "igHandle":
      return v.replace(/^@/, "");
    default:
      return v;
  }
}
