import { Schema, type InferSchemaType, type Types } from "mongoose";
import { registerModel } from "./registerModel";

export const SOURCE_TYPES = ["playstore", "appstore", "blog_rss", "website", "news", "reddit"] as const;
export type SourceType = (typeof SOURCE_TYPES)[number];

const competitorSourceSchema = new Schema(
  {
    type: { type: String, required: true, enum: SOURCE_TYPES },
    url: { type: String, required: true, trim: true },
    // website sources only: scope the watcher to this CSS selector, so only
    // changes inside that section count as a diff (ignores nav, banners, etc.).
    selector: { type: String, default: null },
    // false pauses the source: it is skipped during watch runs.
    enabled: { type: Boolean, default: true },
    lastCheckedHash: { type: String, default: null },
    lastCheckedAt: { type: Date, default: null },
    // Feed sources (blog_rss, news, reddit) only: stable per-item keys seen so far.
    // Change detection hashes this set so feed reshuffles never trigger a diff.
    lastSeenItemKeys: { type: [String], default: undefined },
  },
  { _id: true }
);

const emailedUpdateSchema = new Schema(
  {
    sourceType: { type: String, required: true },
    summary: { type: String, required: true },
    sourceUrl: { type: String, default: "" },
    detectedAt: { type: Date, default: null },
    relevantArea: { type: String, default: null },
    urgency: { type: String, default: null },
    emailedAt: { type: Date, default: null },
    emailSent: { type: Boolean, required: true, default: false },
  },
  { _id: false }
);

const competitorSchema = new Schema(
  {
    userProductId: {
      type: Schema.Types.ObjectId,
      ref: "UserProduct",
      required: true,
      index: true,
    },
    name: { type: String, required: true, trim: true },
    sources: { type: [competitorSourceSchema], default: [] },
    emailedUpdates: { type: [emailedUpdateSchema], default: [] },
    lastUpdatesEmailSent: { type: Boolean, default: false },
    lastUpdatesEmailAt: { type: Date, default: null },
  },
  { timestamps: true }
);

export type CompetitorSource = InferSchemaType<typeof competitorSourceSchema>;
export type Competitor = InferSchemaType<typeof competitorSchema> & {
  _id: Types.ObjectId;
};

export const CompetitorModel = registerModel<Competitor>("Competitor", competitorSchema);
