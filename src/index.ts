import { connectDb, disconnectDb } from "./config/db";
import { AlertLogModel, ChangeLogModel, CompetitorModel, UserProductModel } from "./models";

async function main(): Promise<void> {
  await connectDb();

  const [products, competitors, changeLogs, alerts] = await Promise.all([
    UserProductModel.countDocuments(),
    CompetitorModel.countDocuments(),
    ChangeLogModel.countDocuments(),
    AlertLogModel.countDocuments(),
  ]);

  console.log("Competitor monitor");
  console.log("MongoDB connected.");
  console.log(`  UserProducts: ${products}`);
  console.log(`  Competitors:  ${competitors}`);
  console.log(`  ChangeLogs:   ${changeLogs}`);
  console.log(`  AlertLogs:    ${alerts}`);
  console.log("Add data:     npm run add-competitor");
  console.log("Hash only:    npm run test-watch");
  console.log("Watch+AI:     npm run watch-now");
  console.log("Email digest: npm run daily-digest");
  console.log("Scheduler:    npm run scheduler");

  await disconnectDb();
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`Failed: ${message}`);
  process.exitCode = 1;
});
