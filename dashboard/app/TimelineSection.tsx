"use client";

import { useCallback, useEffect, useState } from "react";
import { Timeline, type TimelineItem } from "./Timeline";

type CompetitorOption = { id: string; name: string };

type Props = {
  userProductId: string;
  competitors: CompetitorOption[];
  initialItems: TimelineItem[];
  initialTotal: number;
};

const PAGE_SIZE = 50;

const selectClass =
  "rounded-lg border border-stone-200 bg-white px-2.5 py-1.5 text-sm text-stone-700 transition-colors duration-150 focus:border-stone-400 focus:outline-none focus:ring-2 focus:ring-stone-900/10";

const inputClass =
  "rounded-lg border border-stone-200 bg-white px-2.5 py-1.5 text-sm text-stone-700 placeholder:text-stone-400 transition-colors duration-150 focus:border-stone-400 focus:outline-none focus:ring-2 focus:ring-stone-900/10";

export function TimelineSection({ userProductId, competitors, initialItems, initialTotal }: Props) {
  const [items, setItems] = useState<TimelineItem[]>(initialItems);
  const [total, setTotal] = useState(initialTotal);
  const [offset, setOffset] = useState(0);
  const [loading, setLoading] = useState(false);

  // Filters
  const [competitorId, setCompetitorId] = useState("");
  const [urgency, setUrgency] = useState("");
  const [area, setArea] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [includeNoise, setIncludeNoise] = useState(false);

  const hasActiveFilters = Boolean(competitorId || urgency || area || dateFrom || dateTo || includeNoise);

  const fetchItems = useCallback(
    async (newOffset: number, replace: boolean) => {
      setLoading(true);
      try {
        const params = new URLSearchParams({ userProductId, limit: String(PAGE_SIZE), offset: String(newOffset) });
        if (competitorId) params.set("competitorId", competitorId);
        if (urgency) params.set("urgency", urgency);
        if (area) params.set("area", area);
        if (dateFrom) params.set("dateFrom", dateFrom);
        if (dateTo) params.set("dateTo", dateTo);
        if (includeNoise) params.set("includeNoise", "true");

        const res = await fetch(`/api/changelogs?${params}`);
        if (!res.ok) return;
        const data = await res.json();

        setItems((prev) => (replace ? data.items : [...prev, ...data.items]));
        setTotal(data.total);
        setOffset(newOffset + data.items.length);
      } finally {
        setLoading(false);
      }
    },
    [userProductId, competitorId, urgency, area, dateFrom, dateTo, includeNoise],
  );

  // Re-fetch from start when any filter changes
  useEffect(() => {
    fetchItems(0, true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [competitorId, urgency, area, dateFrom, dateTo, includeNoise]);

  function clearFilters() {
    setCompetitorId("");
    setUrgency("");
    setArea("");
    setDateFrom("");
    setDateTo("");
    setIncludeNoise(false);
  }

  const hasMore = offset < total;

  return (
    <div>
      {/* Filter bar */}
      <div className="mb-4 rounded-xl border border-stone-200 bg-white p-4">
        <div className="mb-3 flex items-center justify-between">
          <span className="text-xs font-medium text-stone-600">Filters</span>
          {hasActiveFilters ? (
            <button
              type="button"
              onClick={clearFilters}
              className="text-xs font-medium text-stone-400 transition-colors duration-150 hover:text-stone-700"
            >
              Clear all
            </button>
          ) : null}
        </div>
        <div className="flex flex-wrap items-end gap-3">
          <label className="flex flex-col gap-1">
            <span className="text-[11px] font-medium text-stone-500">Competitor</span>
            <select value={competitorId} onChange={(e) => setCompetitorId(e.target.value)} className={selectClass}>
              <option value="">All</option>
              {competitors.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </label>

          <label className="flex flex-col gap-1">
            <span className="text-[11px] font-medium text-stone-500">Urgency</span>
            <select value={urgency} onChange={(e) => setUrgency(e.target.value)} className={selectClass}>
              <option value="">All</option>
              <option value="high">High</option>
              <option value="medium">Medium</option>
              <option value="low">Low</option>
            </select>
          </label>

          <label className="flex flex-col gap-1">
            <span className="text-[11px] font-medium text-stone-500">Area</span>
            <input
              type="text"
              value={area}
              onChange={(e) => setArea(e.target.value)}
              placeholder="e.g. pricing"
              className={`${inputClass} w-32`}
            />
          </label>

          <label className="flex flex-col gap-1">
            <span className="text-[11px] font-medium text-stone-500">From</span>
            <input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} className={inputClass} />
          </label>

          <label className="flex flex-col gap-1">
            <span className="text-[11px] font-medium text-stone-500">To</span>
            <input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} className={inputClass} />
          </label>

          <label className="flex items-center gap-2 pb-0.5">
            <input
              type="checkbox"
              checked={includeNoise}
              onChange={(e) => setIncludeNoise(e.target.checked)}
              className="h-4 w-4 rounded border-stone-300 text-stone-900 focus:ring-stone-900/10"
            />
            <span className="text-xs text-stone-600">Show noise</span>
          </label>
        </div>
      </div>

      {/* Count */}
      <div className="mb-4 flex items-center justify-between">
        <p className="text-xs text-stone-500">
          {total} {total === 1 ? "entry" : "entries"}
          {hasActiveFilters ? " (filtered)" : ""}
        </p>
        {loading ? (
          <span className="inline-flex items-center gap-1.5 text-xs text-stone-400">
            <svg className="h-3 w-3 animate-spin" viewBox="0 0 24 24" fill="none">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
            </svg>
            Loading…
          </span>
        ) : null}
      </div>

      <Timeline items={items} />

      {hasMore ? (
        <div className="mt-6 text-center">
          <button
            type="button"
            disabled={loading}
            onClick={() => fetchItems(offset, false)}
            className="inline-flex items-center gap-2 rounded-lg border border-stone-200 bg-white px-5 py-2.5 text-sm font-medium text-stone-600 transition-all duration-150 hover:border-stone-300 hover:bg-stone-50 hover:text-stone-900 disabled:opacity-50"
          >
            {loading ? (
              <>
                <svg className="h-4 w-4 animate-spin" viewBox="0 0 24 24" fill="none">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                </svg>
                Loading…
              </>
            ) : (
              "Load more"
            )}
          </button>
        </div>
      ) : null}
    </div>
  );
}
