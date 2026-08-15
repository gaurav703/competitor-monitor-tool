import { fetchWebsite } from "../src/watchers/websiteWatcher";

let failures = 0;
function check(name: string, actual: boolean): void {
  const status = actual ? "PASS" : "FAIL";
  if (!actual) failures += 1;
  console.log(`  [${status}] ${name}`);
}

async function main(): Promise<void> {
  console.log("== 1. Selector scopes the hashed content ==");
  const scoped = await fetchWebsite("https://example.com", "h1");
  const full = await fetchWebsite("https://example.com");
  check("scoped text is much smaller than full page", scoped.canonicalText.length < full.canonicalText.length);
  check("scoped text contains only the section", /Example Domain/i.test(scoped.canonicalText) && scoped.canonicalText.length < 80);
  check("meta.selector recorded", scoped.meta.selector === "h1");
  check("unscoped fetch has no selector", full.meta.selector === null);

  console.log("\n== 2. Same section, stable across fetches ==");
  const again = await fetchWebsite("https://example.com", "h1");
  check("scoped canonical text is deterministic", again.canonicalText === scoped.canonicalText);

  console.log("\n== 3. Selector matching nothing errors clearly ==");
  try {
    await fetchWebsite("https://example.com", "#does-not-exist");
    check("no-match throws", false);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    check("no-match throws", true);
    check("message names selector and url", message.includes("#does-not-exist") && message.includes("example.com"));
  }

  console.log("\n== 4. Whitespace-only selector treated as unscoped ==");
  const blank = await fetchWebsite("https://example.com", "   ");
  check("blank selector behaves like no selector", blank.meta.selector === null && blank.canonicalText === full.canonicalText);

  console.log(failures === 0 ? "\nALL CHECKS PASSED" : `\n${failures} CHECK(S) FAILED`);
  process.exit(failures === 0 ? 0 : 1);
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`Script failed: ${message}`);
  process.exit(1);
});
