import { Schema, model, type InferSchemaType, type Types } from "mongoose";

export const ALERT_CHANNELS = ["email", "slack"] as const;
export type AlertChannel = (typeof ALERT_CHANNELS)[number];

const alertLogSchema = new Schema(
  {
    changeLogId: {
      type: Schema.Types.ObjectId,
      ref: "ChangeLog",
      required: true,
      index: true,
    },
    channel: { type: String, required: true, enum: ALERT_CHANNELS },
    sentAt: { type: Date, required: true, default: Date.now },
  },
  { timestamps: true }
);

alertLogSchema.index({ changeLogId: 1, channel: 1 }, { unique: true });

export type AlertLog = InferSchemaType<typeof alertLogSchema> & {
  _id: Types.ObjectId;
};

export const AlertLogModel = model("AlertLog", alertLogSchema);
