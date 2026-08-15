import { Schema, type InferSchemaType, type Types } from "mongoose";
import { registerModel } from "./registerModel";

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

export const UserProductModel = registerModel<UserProduct>("UserProduct", userProductSchema);
