"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

type DiscoveryNote = { kind: string; detail: string };
type AddResult = {
  name: string;
  ok: boolean;
  skipped?: boolean;
  error?: string;
  notes: DiscoveryNote[];
};
type Suggestion = { name: string; why: string };

export function CompetitorForm({ userProductId }: { userProductId: string }) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [results, setResults] = useState<AddResult[]>([]);
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [suggestStatus, setSuggestStatus] = useState<"loading" | "ready" | "error">("loading");
  const [suggestError, setSuggestError] = useState<string | null>(null);
  const [suggestionsFromCache, setSuggestionsFromCache] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [picked, setPicked] = useState<string[]>([]);

  useEffect(() => {
    let cancelled = false;
    setSuggestStatus("loading");
    setSuggestError(null);
    setPicked([]);
    setSuggestionsFromCache(false);
    fetch(`/api/competitors/suggest?userProductId=${encodeURIComponent(userProductId)}`)
      .then(async (response) => {
        const payload = (await response.json()) as {
          suggestions?: Suggestion[];
          error?: string;
          fromCache?: boolean;
        };
        if (cancelled) {
          return;
        }
        if (!response.ok) {
          setSuggestStatus("error");
          setSuggestError(payload.error ?? "Could not load Gemini suggestions.");
          setSuggestions([]);
          return;
        }
        setSuggestions(payload.suggestions ?? []);
        setSuggestionsFromCache(Boolean(payload.fromCache));
        setSuggestStatus("ready");
      })
      .catch(() => {
        if (!cancelled) {
          setSuggestStatus("error");
          setSuggestError("Could not load Gemini suggestions.");
        }
      });
    return () => {
      cancelled = true;
    };
  }, [userProductId]);

  async function refreshSuggestions() {
    setRefreshing(true);
    setSuggestError(null);
    try {
      const response = await fetch(
        `/api/competitors/suggest?userProductId=${encodeURIComponent(userProductId)}&refresh=1`
      );
      const payload = (await response.json()) as {
        suggestions?: Suggestion[];
        error?: string;
        fromCache?: boolean;
      };
      if (!response.ok) {
        setSuggestError(payload.error ?? "Could not refresh suggestions.");
        return;
      }
      if (payload.error) {
        // Refresh failed but the saved list is still shown.
        setSuggestError(payload.error);
      }
      setSuggestions(payload.suggestions ?? []);
      setSuggestionsFromCache(Boolean(payload.fromCache));
      setSuggestStatus("ready");
    } catch {
      setSuggestError("Could not refresh suggestions.");
    } finally {
      setRefreshing(false);
    }
  }

  function onPickFromDropdown(event: React.ChangeEvent<HTMLSelectElement>) {
    const name = event.target.value;
    event.target.value = "";
    if (!name || picked.some((row) => row.toLowerCase() === name.toLowerCase())) {
      return;
    }
    setPicked((current) => [...current, name]);
  }

  function removePicked(name: string) {
    setPicked((current) => current.filter((row) => row !== name));
  }

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setResults([]);
    const form = event.currentTarget;
    const data = new FormData(form);
    const manual = String(data.get("name") ?? "");
    if (picked.length === 0 && !manual.trim()) {
      setError("Select a suggested competitor or type a name.");
      return;
    }
    setPending(true);
    const response = await fetch("/api/competitors", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        userProductId,
        name: manual,
        names: picked,
      }),
    });
    setPending(false);
    const payload = (await response.json()) as { error?: string; results?: AddResult[] };
    setResults(payload.results ?? []);
    if (!response.ok && (payload.results ?? []).every((row) => !row.ok)) {
      setError(payload.error ?? "Could not save competitors.");
      return;
    }
    if (payload.results?.some((row) => !row.ok)) {
      setError(payload.error ?? "Some names could not be added.");
    }
    if (payload.results?.some((row) => row.ok)) {
      const added = new Set(
        (payload.results ?? []).filter((row) => row.ok).map((row) => row.name.toLowerCase())
      );
      setPicked((current) => current.filter((name) => !added.has(name.toLowerCase())));
      setSuggestions((current) => current.filter((row) => !added.has(row.name.toLowerCase())));
      router.refresh();
    }
    if (payload.results?.length && payload.results.every((row) => row.ok)) {
      form.reset();
    }
  }

  return (
    <form onSubmit={onSubmit} className="space-y-3 rounded-lg border border-stone-200 bg-white p-4">
      <h2 className="font-serif text-lg">Add competitors</h2>
      <p className="text-sm text-stone-600">
        Gemini suggests rivals for your product. Pick from the list, or type names yourself. We then look up Play
        Store, App Store, website, and RSS.
      </p>

      <label className="block text-sm">
        <span className="mb-1 flex items-center justify-between text-stone-700">
          Suggested by Gemini
          <button
            type="button"
            onClick={refreshSuggestions}
            disabled={suggestStatus === "loading" || refreshing}
            className="text-xs font-medium text-stone-500 hover:text-stone-900 disabled:opacity-50"
          >
            {refreshing ? "Refreshing…" : "↻ Refresh"}
          </button>
        </span>
        <select
          disabled={suggestStatus !== "ready" || suggestions.length === 0}
          onChange={onPickFromDropdown}
          defaultValue=""
          className="w-full rounded border border-stone-300 px-3 py-2 text-sm"
        >
          <option value="">
            {suggestStatus === "loading"
              ? "Asking Gemini…"
              : refreshing
                ? "Refreshing…"
                : suggestions.length === 0
                  ? "No suggestions"
                  : "Select a competitor…"}
          </option>
          {suggestions.map((row) => (
            <option key={row.name} value={row.name} title={row.why}>
              {row.name}
            </option>
          ))}
        </select>
      </label>
      {suggestError ? <p className="text-xs text-red-700">{suggestError}</p> : null}
      {suggestionsFromCache && !suggestError ? (
        <p className="text-xs text-stone-400">Showing saved suggestions — hit Refresh for new picks.</p>
      ) : null}
      {picked.length > 0 ? (
        <ul className="flex flex-wrap gap-2">
          {picked.map((name) => (
            <li key={name}>
              <button
                type="button"
                onClick={() => removePicked(name)}
                className="rounded-full bg-stone-900 px-3 py-1 text-xs text-white"
              >
                {name} ×
              </button>
            </li>
          ))}
        </ul>
      ) : null}
      {suggestions.length > 0 ? (
        <ul className="space-y-1 text-xs text-stone-500">
          {suggestions.slice(0, 4).map((row) => (
            <li key={`why-${row.name}`}>
              <span className="font-medium text-stone-700">{row.name}:</span> {row.why}
            </li>
          ))}
        </ul>
      ) : null}

      <label className="block text-sm">
        <span className="mb-1 block text-stone-700">Or add manually</span>
        <textarea
          name="name"
          rows={2}
          placeholder="Zerodha, Groww, Dhan"
          className="w-full rounded border border-stone-300 px-3 py-2 text-sm"
        />
      </label>
      {error ? <p className="text-sm text-red-700">{error}</p> : null}
      {results.length > 0 ? (
        <ul className="space-y-3 text-xs text-stone-600">
          {results.map((row) => (
            <li key={row.name}>
              <p className="font-medium text-stone-800">
                {row.name}{" "}
                <span className={row.ok ? "text-emerald-700" : "text-red-700"}>
                  {row.ok ? "added" : row.skipped ? "skipped" : "failed"}
                </span>
              </p>
              {row.error ? <p className="text-red-700">{row.error}</p> : null}
              {row.notes.map((note) => (
                <p key={`${row.name}-${note.kind}-${note.detail}`}>
                  {note.kind}: {note.detail}
                </p>
              ))}
            </li>
          ))}
        </ul>
      ) : null}
      <button disabled={pending} className="rounded bg-stone-900 px-4 py-2 text-sm text-white disabled:opacity-50">
        {pending ? "Discovering sources…" : "Add competitors"}
      </button>
    </form>
  );
}
