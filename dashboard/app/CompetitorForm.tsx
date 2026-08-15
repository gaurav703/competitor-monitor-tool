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

const inputClass =
  "w-full rounded-lg border border-stone-200 bg-white px-3.5 py-2.5 text-sm text-stone-900 placeholder:text-stone-400 transition-colors duration-150 focus:border-stone-400 focus:outline-none focus:ring-2 focus:ring-stone-900/10";

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
    <form onSubmit={onSubmit} className="rounded-xl border border-stone-200 bg-white p-5">
      <h2 className="font-serif text-lg tracking-tight">Add competitors</h2>
      <p className="mt-0.5 text-sm text-stone-500">
        Gemini suggests rivals for your product. Pick from the list, or type names yourself.
      </p>

      <div className="mt-4 space-y-3">
        {/* Gemini suggestions */}
        <div>
          <div className="mb-1.5 flex items-center justify-between">
            <span className="text-xs font-medium text-stone-600">Suggested by Gemini</span>
            <button
              type="button"
              onClick={refreshSuggestions}
              disabled={suggestStatus === "loading" || refreshing}
              className="text-xs font-medium text-stone-400 transition-colors duration-150 hover:text-stone-700 disabled:opacity-50"
            >
              {refreshing ? (
                <span className="inline-flex items-center gap-1">
                  <svg className="h-3 w-3 animate-spin" viewBox="0 0 24 24" fill="none">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                  </svg>
                  Refreshing…
                </span>
              ) : (
                "↻ Refresh"
              )}
            </button>
          </div>
          <select
            disabled={suggestStatus !== "ready" || suggestions.length === 0}
            onChange={onPickFromDropdown}
            defaultValue=""
            className={inputClass}
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
        </div>

        {suggestError ? (
          <div className="rounded-lg bg-red-50 px-3 py-2 text-xs text-red-700">{suggestError}</div>
        ) : null}
        {suggestionsFromCache && !suggestError ? (
          <p className="text-xs text-stone-400">Showing saved suggestions — hit Refresh for new picks.</p>
        ) : null}

        {/* Picked chips */}
        {picked.length > 0 ? (
          <div className="flex flex-wrap gap-1.5">
            {picked.map((name) => (
              <button
                key={name}
                type="button"
                onClick={() => removePicked(name)}
                className="inline-flex items-center gap-1 rounded-full bg-stone-900 px-3 py-1 text-xs font-medium text-white transition-opacity duration-150 hover:opacity-80"
              >
                {name}
                <svg className="h-3 w-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            ))}
          </div>
        ) : null}

        {/* Why bullets */}
        {suggestions.length > 0 ? (
          <ul className="space-y-1 text-xs text-stone-500">
            {suggestions.slice(0, 4).map((row) => (
              <li key={`why-${row.name}`} className="flex gap-1.5">
                <span className="mt-1 h-1 w-1 shrink-0 rounded-full bg-stone-300" />
                <span>
                  <span className="font-medium text-stone-700">{row.name}:</span> {row.why}
                </span>
              </li>
            ))}
          </ul>
        ) : null}

        {/* Manual input */}
        <div>
          <span className="mb-1.5 block text-xs font-medium text-stone-600">Or add manually</span>
          <textarea
            name="name"
            rows={2}
            placeholder="Zerodha, Groww, Dhan"
            className={inputClass}
          />
        </div>
      </div>

      {error ? (
        <div className="mt-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>
      ) : null}

      {/* Results */}
      {results.length > 0 ? (
        <div className="mt-3 space-y-2">
          {results.map((row) => (
            <div
              key={row.name}
              className={`rounded-lg px-3 py-2 text-xs ${
                row.ok ? "bg-emerald-50 text-emerald-800" : "bg-red-50 text-red-700"
              }`}
            >
              <p className="font-medium">
                {row.name}{" "}
                <span className={row.ok ? "text-emerald-600" : "text-red-600"}>
                  {row.ok ? "✓ added" : row.skipped ? "skipped" : "✗ failed"}
                </span>
              </p>
              {row.error ? <p className="mt-0.5">{row.error}</p> : null}
              {row.notes.map((note) => (
                <p key={`${row.name}-${note.kind}-${note.detail}`} className="mt-0.5 opacity-80">
                  {note.kind}: {note.detail}
                </p>
              ))}
            </div>
          ))}
        </div>
      ) : null}

      <button
        disabled={pending}
        className="mt-4 w-full rounded-lg bg-stone-900 px-4 py-2.5 text-sm font-medium text-white transition-all duration-150 hover:bg-stone-800 active:bg-stone-950 disabled:opacity-50"
      >
        {pending ? (
          <span className="inline-flex items-center gap-2">
            <svg className="h-4 w-4 animate-spin" viewBox="0 0 24 24" fill="none">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
            </svg>
            Discovering sources…
          </span>
        ) : (
          "Add competitors"
        )}
      </button>
    </form>
  );
}
