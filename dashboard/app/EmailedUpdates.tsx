function formatDate(value: Date | string | null | undefined): string {
  if (!value) {
    return "Date unavailable";
  }
  const parsed = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return "Date unavailable";
  }
  return parsed.toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
}

function urgencyClass(urgency: string | null | undefined): string {
  if (urgency === "high") {
    return "bg-red-100 text-red-800";
  }
  if (urgency === "medium") {
    return "bg-amber-100 text-amber-900";
  }
  return "bg-emerald-100 text-emerald-800";
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
      <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-medium text-emerald-800">
        Email sent{sentAt ? ` · ${formatDate(sentAt)}` : ""}
      </span>
    );
  }
  return (
    <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-900">
      Email not sent
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
  return (
    <div className="mt-4 space-y-2">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs font-medium uppercase tracking-wide text-stone-500">Last 2 updates</p>
        <EmailSentBadge sent={emailSent} sentAt={emailSentAt} />
      </div>
      {updates.length === 0 ? (
        <p className="text-xs text-stone-500">No updates captured yet.</p>
      ) : (
        updates.slice(0, 2).map((item) => {
          const itemSent = item.emailSent ?? emailSent;
          return (
            <article
              key={`${item.sourceType}-${item.sourceUrl}-${item.summary.slice(0, 24)}`}
              className="rounded border border-stone-200 bg-stone-50 p-3"
            >
              <div className="mb-1 flex flex-wrap items-center gap-2 text-xs">
                <span className="text-stone-500">{formatDate(item.detectedAt)}</span>
                <span className="rounded-full bg-stone-100 px-2 py-0.5 text-stone-700">
                  {item.relevantArea ?? "unspecified"}
                </span>
                {item.urgency ? (
                  <span className={`rounded-full px-2 py-0.5 ${urgencyClass(item.urgency)}`}>{item.urgency}</span>
                ) : null}
                <span className="text-stone-400">{item.sourceType}</span>
                <EmailSentBadge sent={itemSent} sentAt={item.emailedAt} />
              </div>
              <p className="mt-1 whitespace-pre-wrap text-sm text-stone-800">{item.summary}</p>
              {item.sourceUrl ? (
                <a
                  href={item.sourceUrl}
                  className="mt-1 inline-block text-xs text-stone-500 underline"
                  target="_blank"
                  rel="noreferrer"
                >
                  Source
                </a>
              ) : null}
            </article>
          );
        })
      )}
    </div>
  );
}
