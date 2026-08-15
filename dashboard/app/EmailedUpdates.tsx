function formatDate(value: Date | string | null | undefined): string {
  if (!value) {
    return "—";
  }
  const parsed = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return "—";
  }
  return parsed.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

function urgencyPill(urgency: string | null | undefined): string {
  const base = "inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium";
  if (urgency === "high") return `${base} bg-red-50 text-red-700 ring-1 ring-red-600/20`;
  if (urgency === "medium") return `${base} bg-amber-50 text-amber-700 ring-1 ring-amber-600/20`;
  return `${base} bg-stone-100 text-stone-600 ring-1 ring-stone-500/20`;
}

export type EmailedUpdateItem = {
  sourceType: string;
  summary: string;
  sourceUrl?: string | null;
  detectedAt?: Date | string | null;
  relevantArea?: string | null;
  urgency?: string | null;
  emailedAt?: Date | string | null;
  emailSent?: boolean;
};

export function EmailSentBadge({
  sent,
  sentAt,
}: {
  sent: boolean;
  sentAt?: Date | string | null;
}) {
  if (sent) {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-0.5 text-[11px] font-medium text-emerald-700 ring-1 ring-emerald-600/20">
        <svg className="h-3 w-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M21.75 6.75v10.5a2.25 2.25 0 01-2.25 2.25h-15a2.25 2.25 0 01-2.25-2.25V6.75m19.5 0A2.25 2.25 0 0019.5 4.5h-15a2.25 2.25 0 00-2.25 2.25m19.5 0v.243a2.25 2.25 0 01-1.07 1.916l-7.5 4.615a2.25 2.25 0 01-2.36 0L3.32 8.91a2.25 2.25 0 01-1.07-1.916V6.75" />
        </svg>
        Sent{sentAt ? ` · ${formatDate(sentAt)}` : ""}
      </span>
    );
  }
  return (
    <span className="inline-flex items-center rounded-full bg-stone-100 px-2 py-0.5 text-[11px] font-medium text-stone-500">
      Not sent
    </span>
  );
}

export function EmailedUpdates({
  updates,
  emailSent,
  emailSentAt,
}: {
  updates: EmailedUpdateItem[];
  emailSent: boolean;
  emailSentAt?: Date | string | null;
}) {
  if (updates.length === 0) {
    return null;
  }

  return (
    <div className="mt-4 space-y-2">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-[11px] font-medium uppercase tracking-wide text-stone-400">Latest updates</p>
        <EmailSentBadge sent={emailSent} sentAt={emailSentAt} />
      </div>
      {updates.slice(0, 2).map((item, idx) => {
        const itemSent = item.emailSent ?? emailSent;
        return (
          <article
            key={`${item.sourceType}-${idx}-${item.summary.slice(0, 24)}`}
            className="rounded-lg border border-stone-200 bg-stone-50 p-3"
          >
            <div className="mb-1.5 flex flex-wrap items-center gap-1.5 text-[11px]">
              <time className="font-medium text-stone-500">{formatDate(item.detectedAt)}</time>
              <span className="rounded-full bg-stone-100 px-2 py-0.5 text-stone-600">
                {item.relevantArea ?? "general"}
              </span>
              {item.urgency ? <span className={urgencyPill(item.urgency)}>{item.urgency}</span> : null}
              <span className="text-stone-400">{item.sourceType}</span>
            </div>
            <p className="whitespace-pre-wrap text-sm leading-relaxed text-stone-700">{item.summary}</p>
            {item.sourceUrl ? (
              <a
                href={item.sourceUrl}
                className="mt-1.5 inline-flex items-center gap-1 text-[11px] text-stone-400 underline decoration-stone-300 underline-offset-2 transition-colors duration-150 hover:text-stone-700"
                target="_blank"
                rel="noreferrer"
              >
                Source
              </a>
            ) : null}
          </article>
        );
      })}
    </div>
  );
}
