import { diffFeedItems, hashFeedKeys } from "../src/services/diffService";
import { fetchBlogRss, type FeedItem } from "../src/watchers/blogRssWatcher";

async function main(): Promise<void> {

function item(key: string, title = key, date = "2026-08-15T00:00:00Z"): FeedItem {
  return { key, date, title, snippet: `snippet for ${title}`, link: `https://example.com/${key}` };
}

let failures = 0;
function check(name: string, actual: boolean): void {
  const status = actual ? "PASS" : "FAIL";
  if (!actual) failures += 1;
  console.log(`  [${status}] ${name}`);
}

console.log("== 1. hashFeedKeys is order-independent ==");
const keysA = ["b", "a", "c"];
const keysB = ["c", "a", "b"];
check("same set, different order -> same hash", hashFeedKeys(keysA) === hashFeedKeys(keysB));
check("new key changes hash", hashFeedKeys(keysA) !== hashFeedKeys([...keysA, "d"]));
check("duplicate keys collapse", hashFeedKeys(["a", "a", "b"]) === hashFeedKeys(["a", "b"]));

console.log("\n== 2. Baseline: first check stores everything, no analysis ==");
const feed1 = [item("a"), item("b"), item("c")];
const baseline = diffFeedItems({ previousHash: null, storedKeys: [], currentKeys: feed1.map((x) => x.key), items: feed1 });
check("isFirstCheck true", baseline.isFirstCheck === true);
check("changed true", baseline.changed === true);
check("all items are the 'new' set", baseline.newItems.length === 3);

console.log("\n== 3. Reshuffle: same items, different order -> no change ==");
const reordered = [feed1[2], feed1[0], feed1[1]] as FeedItem[];
const second = diffFeedItems({
  previousHash: baseline.currentHash,
  storedKeys: baseline.nextSeenKeys,
  currentKeys: reordered.map((x) => x.key),
  items: reordered,
});
check("isFirstCheck false", second.isFirstCheck === false);
check("NOT changed on reshuffle", second.changed === false);
check("no new keys", second.newKeys.length === 0);

console.log("\n== 4. One genuinely new item -> changed, only it is analyzed ==");
const withNew = [...reordered, item("d", "Brand new feature", "2026-08-16T00:00:00Z")];
const third = diffFeedItems({
  previousHash: baseline.currentHash,
  storedKeys: baseline.nextSeenKeys,
  currentKeys: withNew.map((x) => x.key),
  items: withNew,
});
check("changed true", third.changed === true);
check("exactly the new item is analyzed", third.newItems.length === 1 && third.newItems[0]!.key === "d");

console.log("\n== 5. Removal of old items -> no change (union semantics) ==");
const shrunk = [feed1[0], feed1[2]] as FeedItem[];
const fourth = diffFeedItems({
  previousHash: third.currentHash,
  storedKeys: third.nextSeenKeys,
  currentKeys: shrunk.map((x) => x.key),
  items: shrunk,
});
check("NOT changed when items drop out", fourth.changed === false);
const returned = diffFeedItems({
  previousHash: fourth.currentHash,
  storedKeys: fourth.nextSeenKeys,
  currentKeys: [feed1[1]!.key],
  items: [feed1[1]!],
});
check("no re-analysis of old items after they return", returned.changed === false && returned.newKeys.length === 0);

console.log("\n== 6. Pre-migration source (old hash format, no stored keys) ==");
const migrated = diffFeedItems({ previousHash: "old-format-hash", storedKeys: [], currentKeys: feed1.map((x) => x.key), items: feed1 });
check("treated as baseline, no analysis", migrated.isFirstCheck === true);

console.log("\n== 7. Seen-key cap evicts history, never current feed keys ==");
const historyKeys = Array.from({ length: 490 }, (_, i) => "h" + i);
const currentKeys = Array.from({ length: 15 }, (_, i) => "c" + i);
const capped = diffFeedItems({ previousHash: null, storedKeys: historyKeys, currentKeys, items: [] });
check("set is capped at 500", capped.nextSeenKeys.length === 500);
check("all current feed keys are kept", currentKeys.every((k) => capped.nextSeenKeys.includes(k)));
check("history beyond capacity is evicted", !capped.nextSeenKeys.includes("h489"));
check("no duplicates in the seen set", new Set(capped.nextSeenKeys).size === capped.nextSeenKeys.length);

console.log("\n== 8. Live RSS fetch (best effort) ==");
try {
  const a = await fetchBlogRss("https://xkcd.com/rss.xml");
  const b = await fetchBlogRss("https://xkcd.com/rss.xml");
  check("itemKeys present", Array.isArray(a.itemKeys) && a.itemKeys.length > 0);
  check("meta.items present", Array.isArray(a.meta.items));
  const hashA = hashFeedKeys(a.itemKeys ?? []);
  const hashB = hashFeedKeys(b.itemKeys ?? []);
  check("two fetches produce the same key-set hash", hashA === hashB);
  console.log(`     feed items: ${a.itemKeys?.length}, hash stable across fetches: ${hashA === hashB}`);
} catch (error) {
  const message = error instanceof Error ? error.message : String(error);
  console.log(`  [SKIP] live fetch failed: ${message}`);
}

  console.log(failures === 0 ? "\nALL CHECKS PASSED" : `\n${failures} CHECK(S) FAILED`);
  process.exit(failures === 0 ? 0 : 1);
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`Script failed: ${message}`);
  process.exit(1);
});
