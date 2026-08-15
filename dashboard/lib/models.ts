import mongoose, { Schema, model, models, type InferSchemaType, type Model, type Types } from "mongoose";
import { SOURCE_TYPES } from "./sourceTypes";

export type { SourceType } from "./sourceTypes";
export { SOURCE_TYPES };

const userProductSchema = new Schema(
  {
    name: { type: String, required: true, trim: true },
    industry: { type: String, required: true, trim: true },
    description: { type: String, required: true, trim: true },
    ownerEmail: { type: String, required: true, trim: true, lowercase: true },
  },
  { timestamps: true }
);

const competitorSourceSchema = new Schema(
  {
    type: { type: String, required: true, enum: SOURCE_TYPES },
    url: { type: String, required: true, trim: true },
    selector: { type: String, default: null },
    enabled: { type: Boolean, default: true },
    lastCheckedHash: { type: String, default: null },
    lastCheckedAt: { type: Date, default: null },
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
    emailedAt: { type: Date, default: null },
    emailSent: { type: Boolean, required: true, default: false },
  },
  { _id: false }
);

const competitorSchema = new Schema(
  {
    userProductId: { type: Schema.Types.ObjectId, ref: "UserProduct", required: true, index: true },
    name: { type: String, required: true, trim: true },
    sources: { type: [competitorSourceSchema], default: [] },
    emailedUpdates: { type: [emailedUpdateSchema], default: [] },
    lastUpdatesEmailSent: { type: Boolean, default: false },
    lastUpdatesEmailAt: { type: Date, default: null },
  },
  { timestamps: true }
);

const changeLogSchema = new Schema(
  {
    competitorId: { type: Schema.Types.ObjectId, ref: "Competitor", required: true, index: true },
    sourceType: { type: String, required: true, enum: SOURCE_TYPES },
    rawDiff: { type: Schema.Types.Mixed, required: true },
    aiSummary: { type: String, default: null },
    relevantArea: { type: String, default: null },
    urgency: { type: String, enum: ["low", "medium", "high"], default: null },
    isMeaningful: { type: Boolean, required: true, default: false },
    detectedAt: { type: Date, required: true, default: Date.now },
    notified: { type: Boolean, required: true, default: false },
  },
  { timestamps: true }
);

const alertLogSchema = new Schema(
  {
    changeLogId: { type: Schema.Types.ObjectId, ref: "ChangeLog", required: true, index: true },
    channel: { type: String, required: true, enum: ["email", "slack"] },
    sentAt: { type: Date, required: true, default: Date.now },
  },
  { timestamps: true }
);
alertLogSchema.index({ changeLogId: 1, channel: 1 }, { unique: true });

export type UserProductDoc = InferSchemaType<typeof userProductSchema> & { _id: Types.ObjectId };
export type CompetitorDoc = InferSchemaType<typeof competitorSchema> & { _id: Types.ObjectId };
export type ChangeLogDoc = InferSchemaType<typeof changeLogSchema> & { _id: Types.ObjectId };
export type AlertLogDoc = InferSchemaType<typeof alertLogSchema> & { _id: Types.ObjectId };

function registerModel<T>(name: string, schema: Schema): Model<T> {
  if (process.env.NODE_ENV !== "production" && models[name]) {
    delete models[name];
    delete mongoose.connection.models[name];
  }
  return (models[name] as Model<T> | undefined) ?? model<T>(name, schema);
}

export const UserProductModel = registerModel<UserProductDoc>("UserProduct", userProductSchema);
export const CompetitorModel = registerModel<CompetitorDoc>("Competitor", competitorSchema);
export const ChangeLogModel = registerModel<ChangeLogDoc>("ChangeLog", changeLogSchema);
export const AlertLogModel = registerModel<AlertLogDoc>("AlertLog", alertLogSchema);
