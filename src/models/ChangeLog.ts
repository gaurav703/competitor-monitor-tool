import { Schema, type InferSchemaType, type Types } from "mongoose";
import { SOURCE_TYPES } from "./Competitor";
import { registerModel } from "./registerModel";

export const URGENCY_LEVELS = ["low", "medium", "high"] as const;
export type Urgency = (typeof URGENCY_LEVELS)[number];

export const ANALYSIS_STATUSES = ["pending", "analyzed", "failed"] as const;
export type AnalysisStatus = (typeof ANALYSIS_STATUSES)[number];

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
    /**
     * "analyzed" once Gemini produced a result; "pending" when every model
     * hit a quota/transient error (rawDiff is kept so analyzePending can
     * retry without re-fetching); "failed" after retries ran out.
     */
    analysisStatus: { type: String, enum: ANALYSIS_STATUSES, default: "analyzed" },
    analysisAttempts: { type: Number, default: 0 },
    analysisError: { type: String, default: null },
  },
  { timestamps: true }
);

export type ChangeLog = InferSchemaType<typeof changeLogSchema> & {
  _id: Types.ObjectId;
};

export const ChangeLogModel = registerModel<ChangeLog>("ChangeLog", changeLogSchema);
