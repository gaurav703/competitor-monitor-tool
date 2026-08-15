import { Schema, model, type InferSchemaType, type Types } from "mongoose";
import { SOURCE_TYPES } from "./Competitor";

export const URGENCY_LEVELS = ["low", "medium", "high"] as const;
export type Urgency = (typeof URGENCY_LEVELS)[number];

const changeLogSchema = new Schema(
  {
    competitorId: {
      type: Schema.Types.ObjectId,
      ref: "Competitor",
      required: true,
      index: true,
    },
    sourceType: { type: String, required: true, enum: SOURCE_TYPES },
    rawDiff: { type: Schema.Types.Mixed, required: true },
    aiSummary: { type: String, default: null },
    relevantArea: { type: String, default: null },
    urgency: { type: String, enum: URGENCY_LEVELS, default: null },
    isMeaningful: { type: Boolean, required: true, default: false },
    detectedAt: { type: Date, required: true, default: Date.now },
    notified: { type: Boolean, required: true, default: false },
  },
  { timestamps: true }
);

export type ChangeLog = InferSchemaType<typeof changeLogSchema> & {
  _id: Types.ObjectId;
};

export const ChangeLogModel = model("ChangeLog", changeLogSchema);
