import QueryClient from "./QueryClient";

export default function QueryPage() {
  return (
    <div className="max-w-4xl mx-auto px-4 py-8 space-y-4">
      <div>
        <h1 className="text-2xl font-semibold">Ask</h1>
        <p className="text-sm text-black/60">
          Ask in plain English, e.g. "all the bros who came to the last event" or "active members who haven't shown up in 30 days".
        </p>
      </div>
      <QueryClient />
    </div>
  );
}
