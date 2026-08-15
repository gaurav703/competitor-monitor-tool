import { dedupeLogsByTitle, normalizeTitle, titlesFromRawDiff, titlesMatch } from "../src/services/dedupe";

let failures = 0;
function check(name: string, actual: boolean): void {
  const status = actual ? "PASS" : "FAIL";
  if (!actual) failures += 1;
  console.log(`  [${status}] ${name}`);
}

function feedRawDiff(titles: string[]): { meta: { items: Array<{ title: string }> } } {
  return { meta: { items: titles.map((title) => ({ title })) } };
}

async function main(): Promise<void> {
  console.log("== 1. normalizeTitle ==");
  check("lowercases and collapses punctuation", normalizeTitle("  Foo Bar!? BAZ  ") === "foo bar baz");
  check("strips trailing ' - Publisher'", normalizeTitle("Company launches new tool - TechCrunch") === "company launches new tool");
  check("strips trailing ' | Publisher'", normalizeTitle("Company launches new tool | Reuters") === "company launches new tool");
  check("strips trailing ' — Publisher'", normalizeTitle("Company launches new tool — CNBC") === "company launches new tool");
  check("real title without suffix unchanged", normalizeTitle("Company launches new tool") === "company launches new tool");
  check("short remainder is not over-stripped", normalizeTitle("Part 2 - Next") !== "part");

  console.log("\n== 2. titlesMatch ==");
  check("exact match", titlesMatch("Company launches new tool", "Company launches new tool"));
  check("same story, publisher suffix", titlesMatch("Company launches new tool - TechCrunch", "Company launches new tool"));
  check("containment >= 15 chars", titlesMatch("company launches new ai tool", "company launches new ai tool for saas teams"));
  check("short titles never containment-match", !titlesMatch("foo bar", "foo bar baz"));
  check("empty titles never match", !titlesMatch("", "anything") && !titlesMatch(" ", " "));

  console.log("\n== 3. titlesFromRawDiff ==");
  const raw = feedRawDiff(["A - Site", "B", "A - Site"]);
  const extracted = titlesFromRawDiff(raw);
  check("extracts and normalizes titles", extracted.includes("a site") && extracted.includes("b"));
  check("dedupes within a rawDiff", extracted.length === 2);
  check("no meta.items -> empty", titlesFromRawDiff({ meta: {} }).length === 0);

  console.log("\n== 4. dedupeLogsByTitle (digest path) ==");
  const logs = [
    { _id: "1", competitorId: "c1", rawDiff: feedRawDiff(["Company launches new tool - TechCrunch"]) },
    { _id: "2", competitorId: "c1", rawDiff: feedRawDiff(["Company launches new tool"]) },
    { _id: "3", competitorId: "c2", rawDiff: feedRawDiff(["Company launches new tool"]) },
    { _id: "4", competitorId: "c1", rawDiff: { meta: {} } },
  ];
  const deduped = dedupeLogsByTitle(logs);
  check("same competitor duplicate dropped (most recent kept)", deduped.some((l) => l._id === "1") && !deduped.some((l) => l._id === "2"));
  check("same title, different competitor kept", deduped.some((l) => l._id === "3"));
  check("log without titles always kept", deduped.some((l) => l._id === "4"));
  check("count matches", deduped.length === 3);

  console.log("\n== 5. Analysis-gate composition (same shape as diffService) ==");
  const recent = ["company launches new tool techcrunch", "other story"];
  const candidates = [
    { key: "k1", title: "Company launches new tool" },
    { key: "k2", title: "Brand new feature ships" },
  ];
  const fresh = candidates.filter((item) => !recent.some((existing) => titlesMatch(existing, item.title)));
  check("duplicate candidate filtered out", fresh.length === 1 && fresh[0]!.key === "k2");

  console.log(failures === 0 ? "\nALL CHECKS PASSED" : `\n${failures} CHECK(S) FAILED`);
  process.exit(failures === 0 ? 0 : 1);
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`Script failed: ${message}`);
  process.exit(1);
});
