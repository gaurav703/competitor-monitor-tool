async function main(): Promise<void> {
  const diff = await import("../src/services/diffService");
  console.log("diffService ok:", typeof diff.runWatchPipeline, typeof diff.checkSource);

  const pending = await import("../src/jobs/analyzePending");
  console.log("analyzePending ok:", typeof pending.retryPendingAnalyses);

  const ai = await import("../src/services/aiAnalysisService");
  console.log("aiAnalysisService ok:", typeof ai.analyzeChange);

  const watch = await import("../src/jobs/watchNow");
  console.log("watchNow ok:", typeof watch.runWatchNow);

  const gemini = await import("../src/services/geminiClient");
  console.log("geminiClient ok:", typeof gemini.generateGeminiText, typeof gemini.generateWithCascade, typeof gemini.isRetryableQuotaError, typeof gemini.AnalysisError);

  const envMod = await import("../src/config/env");
  console.log("env fallbacks:", JSON.stringify(envMod.env.geminiModelFallbacks));
}

main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
