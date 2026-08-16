function urgencyPill(urgency: string | null): string {
  const base = "inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium";
  if (urgency === "high") return `${base} bg-red-50 text-red-700 ring-1 ring-red-600/20`;
  if (urgency === "medium") return `${base} bg-amber-50 text-amber-700 ring-1 ring-amber-600/20`;
  return `${base} bg-stone-100 text-stone-600 ring-1 ring-stone-500/20`;
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
};

export function Timeline({ items }: { items: TimelineItem[] }) {
  const grouped = new Map<string, TimelineItem[]>();
  for (const item of items) {
    const list = grouped.get(item.competitorName) ?? [];
    list.push(item);
    grouped.set(item.competitorName, list);
  }

  if (items.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-stone-300 bg-white/50 py-12">
        <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-stone-100">
          <svg className="h-6 w-6 text-stone-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6h4.5m4.5 0a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
        </div>
        <p className="text-sm font-medium text-stone-700">No changes yet</p>
        <p className="mt-1 max-w-xs text-center text-xs text-stone-500">
          Run a watch to detect changes. The first fetch is a baseline — changes appear on the next run.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      {[...grouped.entries()].map(([name, rows]) => (
        <section key={name}>
          <div className="mb-3 flex items-center gap-2">
            <h3 className="font-serif text-lg tracking-tight">{name}</h3>
            <span className="rounded-full bg-stone-100 px-2 py-0.5 text-[11px] font-medium text-stone-500">
              {rows.length}
            </span>
          </div>
          <ol className="space-y-2">
            {rows.map((item) => (
              <li
                key={item.id}
                className="rounded-xl border border-stone-200 bg-white p-4 transition-shadow duration-200 hover:shadow-sm"
              >
                <div className="mb-2 flex flex-wrap items-center gap-2 text-xs">
                  <time className="font-medium text-stone-500">
                    {new Date(item.detectedAt).toLocaleDateString("en-US", {
                      month: "short",
                      day: "numeric",
                      year: "numeric",
                    })}
                  </time>
                  <span className="text-stone-300">·</span>
                  <span className="rounded-full bg-stone-100 px-2 py-0.5 text-[11px] font-medium text-stone-600">
                    {item.relevantArea ?? "general"}
                  </span>
                  <span className={urgencyPill(item.urgency)}>{item.urgency ?? "low"}</span>
                  <span className="text-[11px] text-stone-400">{item.sourceType}</span>
                </div>
                <p className="text-sm leading-relaxed text-stone-800">{item.aiSummary ?? "No summary available."}</p>
                {item.sourceUrl ? (
                  <a
                    href={item.sourceUrl}
                    className="mt-2 inline-flex items-center gap-1 text-xs text-stone-400 underline decoration-stone-300 underline-offset-2 transition-colors duration-150 hover:text-stone-700 hover:decoration-stone-500"
                    target="_blank"
                    rel="noreferrer"
                  >
                    <svg className="h-3 w-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 6H5.25A2.25 2.25 0 003 8.25v10.5A2.25 2.25 0 005.25 21h10.5A2.25 2.25 0 0018 18.75V10.5m-10.5 6L21 3m0 0h-5.25M21 3v5.25" />
                    </svg>
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
