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

  const hasMore = offset < total;

  return (
    <div>
      {/* Filter bar */}
      <div className="mb-4 flex flex-wrap items-end gap-3 rounded-lg border border-stone-200 bg-white p-3">
        <label className="flex flex-col gap-1 text-xs">
          <span className="font-medium text-stone-600">Competitor</span>
          <select
            value={competitorId}
            onChange={(e) => setCompetitorId(e.target.value)}
            className="rounded border border-stone-300 px-2 py-1 text-sm"
          >
            <option value="">All</option>
            {competitors.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </label>

        <label className="flex flex-col gap-1 text-xs">
          <span className="font-medium text-stone-600">Urgency</span>
          <select
            value={urgency}
            onChange={(e) => setUrgency(e.target.value)}
            className="rounded border border-stone-300 px-2 py-1 text-sm"
          >
            <option value="">All</option>
            <option value="high">High</option>
            <option value="medium">Medium</option>
            <option value="low">Low</option>
          </select>
        </label>

        <label className="flex flex-col gap-1 text-xs">
          <span className="font-medium text-stone-600">Area contains</span>
          <input
            type="text"
            value={area}
            onChange={(e) => setArea(e.target.value)}
            placeholder="e.g. pricing"
            className="rounded border border-stone-300 px-2 py-1 text-sm"
          />
        </label>

        <label className="flex flex-col gap-1 text-xs">
          <span className="font-medium text-stone-600">From</span>
          <input
            type="date"
            value={dateFrom}
            onChange={(e) => setDateFrom(e.target.value)}
            className="rounded border border-stone-300 px-2 py-1 text-sm"
          />
        </label>

        <label className="flex flex-col gap-1 text-xs">
          <span className="font-medium text-stone-600">To</span>
          <input
            type="date"
            value={dateTo}
            onChange={(e) => setDateTo(e.target.value)}
            className="rounded border border-stone-300 px-2 py-1 text-sm"
          />
        </label>

        <label className="flex items-center gap-1.5 text-xs">
          <input
            type="checkbox"
            checked={includeNoise}
            onChange={(e) => setIncludeNoise(e.target.checked)}
            className="h-3.5 w-3.5 rounded border-stone-300"
          />
          <span className="text-stone-600">Include noise</span>
        </label>
      </div>

      <p className="mb-3 text-xs text-stone-500">
        {total} {total === 1 ? "entry" : "entries"}
        {competitorId || urgency || area || dateFrom || dateTo ? " (filtered)" : ""}
      </p>

      <Timeline items={items} />

      {hasMore ? (
        <div className="mt-4 text-center">
          <button
            type="button"
            disabled={loading}
            onClick={() => fetchItems(offset, false)}
            className="rounded-full border border-stone-300 bg-white px-4 py-2 text-sm text-stone-700 hover:bg-stone-50 disabled:opacity-50"
          >
            {loading ? "Loading…" : "Load more"}
          </button>
        </div>
      ) : null}
    </div>
  );
}
