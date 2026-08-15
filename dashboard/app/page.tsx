import Link from "next/link";
import { connectDb } from "@/lib/db";
import { ChangeLogModel, CompetitorModel, UserProductModel, type CompetitorDoc } from "@/lib/models";
import { AddSource } from "./AddSource";
import { CompetitorControls } from "./CompetitorControls";
import { CompetitorForm } from "./CompetitorForm";
import { EmailedUpdates } from "./EmailedUpdates";
import { ProductForm } from "./ProductForm";
import { SourceActions } from "./SourceActions";
import { SourceSelector } from "./SourceSelector";
import { TimelineSection } from "./TimelineSection";
import { WatchButton } from "./WatchButton";

export const dynamic = "force-dynamic";

const SOURCE_LABELS: Record<string, string> = {
  playstore: "Play Store",
  appstore: "App Store",
  blog_rss: "RSS",
  website: "Website",
  news: "News",
};

function sourceTypeBadge(type: string): string {
  const base = "inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium";
  switch (type) {
    case "playstore":
      return `${base} bg-emerald-50 text-emerald-700 ring-1 ring-emerald-600/20`;
    case "appstore":
      return `${base} bg-sky-50 text-sky-700 ring-1 ring-sky-600/20`;
    case "blog_rss":
      return `${base} bg-orange-50 text-orange-700 ring-1 ring-orange-600/20`;
    case "news":
      return `${base} bg-violet-50 text-violet-700 ring-1 ring-violet-600/20`;
    default:
      return `${base} bg-stone-100 text-stone-600 ring-1 ring-stone-500/20`;
  }
}

export default async function HomePage({
  searchParams,
}: {
  searchParams: Promise<{ userProductId?: string }>;
}) {
  await connectDb();
  const params = await searchParams;
  const products = await UserProductModel.find().sort({ createdAt: -1 }).lean();
  const selectedId = params.userProductId ?? products[0]?._id.toString();
  const selected = products.find((product) => product._id.toString() === selectedId) ?? products[0];

  let initialItems: {
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
  }[] = [];
  let initialTotal = 0;
  let competitors: CompetitorDoc[] = [];
  let competitorOptions: { id: string; name: string }[] = [];

  if (selected) {
    competitors = (await CompetitorModel.find({ userProductId: selected._id }).lean()) as CompetitorDoc[];
    competitorOptions = competitors.map((row) => ({ id: row._id.toString(), name: row.name }));
    const nameById = new Map(competitors.map((row) => [row._id.toString(), row.name]));

    const query = {
      competitorId: { $in: competitors.map((row) => row._id) },
      isMeaningful: true,
    };

    const [total, logs] = await Promise.all([
      ChangeLogModel.countDocuments(query),
      ChangeLogModel.find(query)
        .sort({ detectedAt: -1 })
        .limit(50)
        .lean(),
    ]);

    initialTotal = total;
    initialItems = logs.map((log) => {
      const raw = log.rawDiff as { url?: string; content?: string } | null;
      return {
        id: log._id.toString(),
        competitorName: nameById.get(log.competitorId.toString()) ?? "Unknown",
        detectedAt: log.detectedAt.toISOString(),
        relevantArea: log.relevantArea ?? null,
        urgency: log.urgency ?? null,
        aiSummary: log.aiSummary ?? null,
        sourceType: log.sourceType,
        sourceUrl: raw?.url ?? null,
        isMeaningful: log.isMeaningful,
        rawDiffContent: raw?.content ?? null,
      };
    });
  }

  // Stats
  const totalSources = competitors.reduce((n, c) => n + c.sources.length, 0);
  const enabledSources = competitors.reduce(
    (n, c) => n + c.sources.filter((s) => s.enabled !== false).length,
    0,
  );
  const highUrgency = initialItems.filter((i) => i.urgency === "high").length;

  return (
    <main className="mx-auto max-w-5xl px-4 py-10">
      {/* Header */}
      <header className="mb-10">
        <p className="text-[11px] font-medium uppercase tracking-[0.2em] text-stone-400">Local v1 · no login</p>
        <h1 className="mt-2 font-serif text-3xl tracking-tight">Competitor monitor</h1>
        <p className="mt-2 max-w-2xl text-sm leading-relaxed text-stone-500">
          Save your product. Gemini suggests rivals, watches their public sources, and sends you a daily digest.
          Email goes out even if you never open this page.
        </p>
      </header>

      {/* Product tabs */}
      {products.length > 0 ? (
        <nav className="mb-8 flex flex-wrap gap-2">
          {products.map((product) => {
            const id = product._id.toString();
            const active = selected?._id.toString() === id;
            return (
              <Link
                key={id}
                href={`/?userProductId=${id}`}
                className={`rounded-full px-4 py-1.5 text-sm font-medium transition-all duration-150 ${
                  active
                    ? "bg-stone-900 text-white shadow-sm"
                    : "bg-white text-stone-600 ring-1 ring-stone-200 hover:ring-stone-300 hover:text-stone-900"
                }`}
              >
                {product.name}
              </Link>
            );
          })}
        </nav>
      ) : null}

      {/* Stats bar */}
      {selected && competitors.length > 0 ? (
        <div className="mb-8 grid grid-cols-2 gap-3 sm:grid-cols-4">
          {[
            { label: "Competitors", value: competitors.length },
            { label: "Sources", value: `${enabledSources}/${totalSources}` },
            { label: "Changes", value: initialTotal },
            { label: "High urgency", value: highUrgency, accent: highUrgency > 0 },
          ].map((stat) => (
            <div
              key={stat.label}
              className="rounded-lg border border-stone-200 bg-white px-4 py-3"
            >
              <p className="text-[11px] font-medium uppercase tracking-wide text-stone-400">{stat.label}</p>
              <p className={`mt-1 text-2xl font-semibold tracking-tight ${stat.accent ? "text-red-600" : "text-stone-900"}`}>
                {stat.value}
              </p>
            </div>
          ))}
        </div>
      ) : null}

      {/* Forms */}
      <div className="mb-12 grid gap-4 lg:grid-cols-2">
        <ProductForm
          key={selected?._id.toString() ?? "new"}
          product={
            selected
              ? {
                  id: selected._id.toString(),
                  name: selected.name,
                  industry: selected.industry,
                  description: selected.description,
                  ownerEmail: selected.ownerEmail,
                }
              : null
          }
        />
        {selected ? (
          <CompetitorForm userProductId={selected._id.toString()} />
        ) : (
          <div className="flex items-center justify-center rounded-lg border border-dashed border-stone-300 bg-white/50 p-8">
            <div className="text-center">
              <div className="mx-auto mb-3 flex h-10 w-10 items-center justify-center rounded-full bg-stone-100">
                <svg className="h-5 w-5 text-stone-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v6m3-3H9m12 0a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              </div>
              <p className="text-sm text-stone-500">Save your product first,</p>
              <p className="text-sm text-stone-500">then add competitors.</p>
            </div>
          </div>
        )}
      </div>

      {/* Watching section */}
      {selected && competitors.length > 0 ? (
        <section className="mb-12">
          <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="font-serif text-2xl tracking-tight">Watching</h2>
              <p className="mt-0.5 text-sm text-stone-500">{competitors.length} competitor{competitors.length !== 1 ? "s" : ""} · {enabledSources} active source{enabledSources !== 1 ? "s" : ""}</p>
            </div>
            <WatchButton userProductId={selected._id.toString()} />
          </div>
          <ul className="space-y-3">
            {competitors.map((competitor) => (
              <li
                key={competitor._id.toString()}
                className="group rounded-xl border border-stone-200 bg-white p-5 transition-shadow duration-200 hover:shadow-md"
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <h3 className="font-medium text-stone-900">{competitor.name}</h3>
                  <CompetitorControls
                    competitorId={competitor._id.toString()}
                    name={competitor.name}
                  />
                </div>
                <ul className="mt-3 space-y-2">
                  {competitor.sources.map((source) => {
                    const disabled = source.enabled === false;
                    return (
                      <li
                        key={`${source.type}-${source.url}-${source._id?.toString() ?? ""}`}
                        className={`flex flex-wrap items-start gap-2 rounded-lg bg-stone-50 px-3 py-2 ${disabled ? "opacity-50" : ""}`}
                      >
                        <div className="flex flex-1 flex-wrap items-center gap-2">
                          <span className={sourceTypeBadge(source.type)}>
                            {SOURCE_LABELS[source.type] ?? source.type}
                          </span>
                          <a
                            href={source.url}
                            className="truncate text-xs text-stone-500 underline decoration-stone-300 underline-offset-2 hover:text-stone-800 hover:decoration-stone-500"
                            target="_blank"
                            rel="noreferrer"
                          >
                            {source.url}
                          </a>
                          {disabled ? (
                            <span className="rounded-full bg-amber-50 px-2 py-0.5 text-[11px] font-medium text-amber-700 ring-1 ring-amber-600/20">
                              paused
                            </span>
                          ) : null}
                        </div>
                        {source._id ? (
                          <div className="flex flex-wrap items-center gap-2">
                            <SourceActions
                              competitorId={competitor._id.toString()}
                              sourceId={source._id.toString()}
                              enabled={!disabled}
                            />
                            {source.type === "website" && !disabled ? (
                              <SourceSelector
                                competitorId={competitor._id.toString()}
                                sourceId={source._id.toString()}
                                initialSelector={source.selector ?? ""}
                              />
                            ) : null}
                          </div>
                        ) : null}
                      </li>
                    );
                  })}
                </ul>
                <AddSource competitorId={competitor._id.toString()} />
                <EmailedUpdates
                  updates={competitor.emailedUpdates ?? []}
                  emailSent={Boolean(competitor.lastUpdatesEmailSent)}
                  emailSentAt={competitor.lastUpdatesEmailAt}
                />
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {/* Timeline section */}
      {selected ? (
        <section>
          <div className="mb-5">
            <h2 className="font-serif text-2xl tracking-tight">Timeline</h2>
            <p className="mt-0.5 text-sm text-stone-500">
              {initialTotal > 0
                ? `${initialTotal} meaningful change${initialTotal !== 1 ? "s" : ""} detected`
                : "Changes will appear here after a watch run detects something new."}
            </p>
          </div>
          <TimelineSection
            userProductId={selected._id.toString()}
            competitors={competitorOptions}
            initialItems={initialItems}
            initialTotal={initialTotal}
          />
        </section>
      ) : null}
    </main>
  );
}
