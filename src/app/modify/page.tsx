import ModifyClient from "./ModifyClient";

export default function ModifyPage() {
  return (
    <div className="max-w-4xl mx-auto px-4 py-8 space-y-4">
      <div>
        <h1 className="text-2xl font-semibold">Modify</h1>
        <p className="text-sm text-black/60">
          Update members in plain English. Examples: "Jordan's phone is 555-1212 and he's now a junior",
          "set Alex's primary contact to Sam and add a note that she's interested in joining the study group".
        </p>
      </div>
      <ModifyClient />
    </div>
  );
}
