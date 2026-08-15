import { Schema, type InferSchemaType, type Types } from "mongoose";
import { registerModel } from "./registerModel";

const userProductSchema = new Schema(
  {
    name: { type: String, required: true, trim: true },
    industry: { type: String, required: true, trim: true },
    description: { type: String, required: true, trim: true },
    ownerEmail: { type: String, required: true, trim: true, lowercase: true },
    /**
     * Cached Gemini competitor suggestions so reopening the dashboard form
     * doesn't burn an API call. Cleared when the product is edited; users
     * can force a fresh set via the dashboard refresh button.
     */
    suggestedCompetitors: {
      type: [
        {
          name: { type: String, required: true, trim: true },
          why: { type: String, default: "" },
        },
      ],
      default: [],
    },
    suggestedAt: { type: Date, default: null },
  },
  { timestamps: true }
);

export type UserProduct = InferSchemaType<typeof userProductSchema> & {
  _id: Types.ObjectId;
};

export const UserProductModel = registerModel<UserProduct>("UserProduct", userProductSchema);
