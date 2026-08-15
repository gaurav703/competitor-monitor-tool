import { Schema, model, type InferSchemaType, type Types } from "mongoose";

const userProductSchema = new Schema(
  {
    name: { type: String, required: true, trim: true },
    industry: { type: String, required: true, trim: true },
    description: { type: String, required: true, trim: true },
    ownerEmail: { type: String, required: true, trim: true, lowercase: true },
  },
  { timestamps: true }
);

export type UserProduct = InferSchemaType<typeof userProductSchema> & {
  _id: Types.ObjectId;
};

export const UserProductModel = model("UserProduct", userProductSchema);
