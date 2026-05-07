import AskClient from "./AskClient";

export default function QueryPage() {
  return (
    <div className="max-w-4xl mx-auto px-4 py-8 space-y-4">
      <div>
        <h1 className="text-2xl font-semibold">Ask</h1>
        <p className="text-sm text-black/60">
          Ask questions or make changes in plain English. Query the roster, update students, or add new people.
        </p>
      </div>
      <AskClient />
    </div>
  );
}
