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
import { Timeline, type TimelineItem } from "./Timeline";
import { WatchButton } from "./WatchButton";

export const dynamic = "force-dynamic";

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

  let items: TimelineItem[] = [];
  let competitors: CompetitorDoc[] = [];
  if (selected) {
    competitors = (await CompetitorModel.find({ userProductId: selected._id }).lean()) as CompetitorDoc[];
    const nameById = new Map(competitors.map((row) => [row._id.toString(), row.name]));
    const logs = await ChangeLogModel.find({
      competitorId: { $in: competitors.map((row) => row._id) },
      isMeaningful: true,
    })
      .sort({ detectedAt: -1 })
      .lean();

    items = logs.map((log) => {
      const raw = log.rawDiff as { url?: string } | null;
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
      };
    });
  }

  return (
    <main className="mx-auto max-w-5xl px-4 py-10">
      <header className="mb-8">
        <p className="text-xs uppercase tracking-[0.2em] text-stone-500">Local v1 · no login</p>
        <h1 className="mt-2 font-serif text-3xl">Competitor monitor</h1>
        <p className="mt-2 max-w-2xl text-sm text-stone-600">
          Save your product. Gemini will suggest rivals; pick from the dropdown or type names. We look up store and RSS sources.
          Email still goes out even if you never open this page.
        </p>
      </header>

      {products.length > 0 ? (
        <nav className="mb-6 flex flex-wrap gap-2">
          {products.map((product) => {
            const id = product._id.toString();
            const active = selected?._id.toString() === id;
            return (
              <Link
                key={id}
                href={`/?userProductId=${id}`}
                className={`rounded-full px-3 py-1 text-sm ${active ? "bg-stone-900 text-white" : "bg-white text-stone-700 border border-stone-200"}`}
              >
                {product.name}
              </Link>
            );
          })}
        </nav>
      ) : null}

      <div className="mb-10 grid gap-4 lg:grid-cols-2">
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
        {selected ? <CompetitorForm userProductId={selected._id.toString()} /> : (
          <p className="rounded-lg border border-dashed border-stone-300 bg-white p-4 text-sm text-stone-600">
            Save your product first, then add competitors.
          </p>
        )}
      </div>

      {selected && competitors.length > 0 ? (
        <section className="mb-10">
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
            <h2 className="font-serif text-2xl">Watching · {selected.name}</h2>
            <WatchButton userProductId={selected._id.toString()} />
          </div>
          <ul className="space-y-3">
            {competitors.map((competitor) => (
              <li key={competitor._id.toString()} className="rounded-lg border border-stone-200 bg-white p-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="font-medium">{competitor.name}</p>
                  <CompetitorControls
                    competitorId={competitor._id.toString()}
                    name={competitor.name}
                  />
                </div>
                <ul className="mt-2 space-y-1 text-xs text-stone-600">
                  {competitor.sources.map((source) => {
                    const disabled = source.enabled === false;
                    return (
                      <li
                        key={`${source.type}-${source.url}-${source._id?.toString() ?? ""}`}
                        className={disabled ? "opacity-50" : undefined}
                      >
                        <span className="font-medium text-stone-800">{source.type}</span>{" "}
                        <a href={source.url} className="underline" target="_blank" rel="noreferrer">
                          {source.url}
                        </a>
                        {disabled ? <span className="ml-1 text-amber-700">(paused)</span> : null}
                        {source._id ? (
                          <div className="mt-1 flex flex-wrap items-center gap-2">
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

      {selected ? (
        <section>
          <h2 className="mb-4 font-serif text-2xl">Timeline · {selected.name}</h2>
          <Timeline items={items} />
        </section>
      ) : null}
    </main>
  );
}
