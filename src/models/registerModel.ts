import { model, models, type Model, type Schema } from "mongoose";

export function registerModel<T>(name: string, schema: Schema): Model<T> {
  return (models[name] as Model<T> | undefined) ?? model<T>(name, schema);
}
