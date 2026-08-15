export { analyzeChange } from "./aiAnalysisService";
export type { ChangeAnalysis, UserProductContext } from "./aiAnalysisService";
export { checkSource, hashContent, runWatchForUserProduct, runWatchPipeline } from "./diffService";
export type { DiffCheckResult, RawDiff, WatchOptions } from "./diffService";
export { sendEmailDigest, sendDigestsForAllProducts } from "./notificationService";
