import ImportClient from "./ImportClient";

export default function ImportPage() {
  return (
    <div className="max-w-4xl mx-auto px-4 py-8 space-y-4">
      <div>
        <h1 className="text-2xl font-semibold">Import students</h1>
        <p className="text-sm text-black/60">
          Drop a CSV exported from Google Sheets / Excel. We'll auto-map columns; you can fix the mapping before committing.
          Dedupe rule: same email, or same first+last name → update existing.
        </p>
      </div>
      <ImportClient />
    </div>
  );
}
