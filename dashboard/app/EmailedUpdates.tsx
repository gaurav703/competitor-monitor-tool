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

export type EmailedUpdateItem = {
  sourceType: string;
  summary: string;
  sourceUrl?: string | null;
  detectedAt?: Date | string | null;
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
              <p className="text-xs text-stone-500">
                {item.sourceType} · {formatDate(item.detectedAt)}
              </p>
              <p className="mt-1 whitespace-pre-wrap text-sm text-stone-800">{item.summary}</p>
              <p className={`mt-2 text-xs font-medium ${itemSent ? "text-emerald-800" : "text-amber-900"}`}>
                {itemSent
                  ? `Email sent${item.emailedAt ? ` · ${formatDate(item.emailedAt)}` : ""}`
                  : "Email not sent"}
              </p>
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
