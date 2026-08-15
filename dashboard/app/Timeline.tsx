"use client";

import { useState } from "react";

function urgencyClass(urgency: string | null): string {
  if (urgency === "high") {
    return "bg-red-100 text-red-800";
  }
  if (urgency === "medium") {
    return "bg-amber-100 text-amber-900";
  }
  return "bg-emerald-100 text-emerald-800";
}

export type TimelineItem = {
  id: string;
  competitorName: string;
  detectedAt: string;
  relevantArea: string | null;
  urgency: string | null;
  aiSummary: string | null;
  sourceType: string;
  sourceUrl: string | null;
  isMeaningful: boolean;
  rawDiffContent: string | null;
};

function DiffToggle({ content }: { content: string }) {
  const [open, setOpen] = useState(false);
  const preview = content.length > 120 ? content.slice(0, 120) + "…" : content;

  return (
    <div className="mt-2">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-1 text-xs font-medium text-stone-600 hover:text-stone-900"
      >
        <svg
          className={`h-3 w-3 transition-transform ${open ? "rotate-90" : ""}`}
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth={2}
        >
          <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
        </svg>
        {open ? "Hide diff" : "Show diff"}
      </button>
      {!open ? (
        <p className="mt-1 text-xs text-stone-400">{preview}</p>
      ) : (
        <pre className="mt-2 max-h-72 overflow-auto rounded-md bg-stone-50 p-3 text-xs leading-relaxed text-stone-700 whitespace-pre-wrap">
          {content}
        </pre>
      )}
    </div>
  );
}

export function Timeline({ items }: { items: TimelineItem[] }) {
  const grouped = new Map<string, TimelineItem[]>();
  for (const item of items) {
    const list = grouped.get(item.competitorName) ?? [];
    list.push(item);
    grouped.set(item.competitorName, list);
  }

  if (items.length === 0) {
    return (
      <p className="rounded-lg border border-dashed border-stone-300 bg-white p-6 text-sm text-stone-600">
        No meaningful changes yet. Run <code className="rounded bg-stone-100 px-1">npm run watch-now</code> after a
        competitor source actually changes (first fetch is a baseline and skips Gemini).
      </p>
    );
  }

  return (
    <div className="space-y-8">
      {[...grouped.entries()].map(([name, rows]) => (
        <section key={name}>
          <h2 className="mb-3 font-serif text-xl">{name}</h2>
          <ol className="space-y-3">
            {rows.map((item) => (
              <li key={item.id} className="rounded-lg border border-stone-200 bg-white p-4">
                <div className="mb-2 flex flex-wrap items-center gap-2 text-xs">
                  <time className="text-stone-500">{new Date(item.detectedAt).toLocaleString()}</time>
                  <span className="rounded-full bg-stone-100 px-2 py-0.5 text-stone-700">{item.relevantArea ?? "unspecified"}</span>
                  <span className={`rounded-full px-2 py-0.5 ${urgencyClass(item.urgency)}`}>{item.urgency ?? "low"}</span>
                  <span className="text-stone-400">{item.sourceType}</span>
                </div>
                <p className="text-sm leading-relaxed text-stone-800">{item.aiSummary ?? "No summary."}</p>
                {item.rawDiffContent ? <DiffToggle content={item.rawDiffContent} /> : null}
                {item.sourceUrl ? (
                  <a href={item.sourceUrl} className="mt-2 inline-block text-xs text-stone-500 underline" target="_blank" rel="noreferrer">
                    Source
                  </a>
                ) : null}
              </li>
            ))}
          </ol>
        </section>
      ))}
    </div>
  );
}
