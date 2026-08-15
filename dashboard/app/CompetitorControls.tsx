"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export function CompetitorControls({
  competitorId,
  name,
}: {
  competitorId: string;
  name: string;
}) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(name);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function rename() {
    const trimmed = value.trim();
    if (!trimmed || trimmed === name) {
      setEditing(false);
      return;
    }
    setBusy(true);
    setError(null);
    const response = await fetch("/api/competitors", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: competitorId, name: trimmed }),
    });
    setBusy(false);
    if (!response.ok) {
      setError("Could not rename.");
      return;
    }
    setEditing(false);
    router.refresh();
  }

  async function remove() {
    if (!window.confirm(`Delete competitor "${name}" and all of its history?`)) {
      return;
    }
    setBusy(true);
    setError(null);
    const response = await fetch(`/api/competitors?id=${encodeURIComponent(competitorId)}`, {
      method: "DELETE",
    });
    setBusy(false);
    if (!response.ok) {
      setError("Could not delete.");
      return;
    }
    router.refresh();
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      {editing ? (
        <>
          <input
            value={value}
            onChange={(event) => setValue(event.target.value)}
            className="w-48 rounded border border-stone-300 px-2 py-1 text-sm"
          />
          <button
            type="button"
            onClick={() => void rename()}
            disabled={busy}
            className="rounded border border-stone-300 px-2 py-1 text-xs text-stone-700 disabled:opacity-50"
          >
            Save
          </button>
          <button
            type="button"
            onClick={() => {
              setEditing(false);
              setValue(name);
            }}
            className="rounded border border-stone-300 px-2 py-1 text-xs text-stone-700"
          >
            Cancel
          </button>
        </>
      ) : (
        <>
          <button
            type="button"
            onClick={() => setEditing(true)}
            className="rounded border border-stone-300 px-2 py-1 text-xs text-stone-700"
          >
            Rename
          </button>
          <button
            type="button"
            onClick={() => void remove()}
            disabled={busy}
            className="rounded border border-red-200 px-2 py-1 text-xs text-red-700 disabled:opacity-50"
          >
            Delete
          </button>
        </>
      )}
      {error ? <span className="text-xs text-red-700">{error}</span> : null}
    </div>
  );
}
