import { createRequire } from "module";
import path from "path";
import { pathToFileURL } from "url";

/**
 * google-play-scraper is ESM-only. A bare `import(specifier)` from a Next
 * server chunk resolves relative to `.next/server/chunks`, which has no
 * node_modules on Vercel. Resolve the file from known install roots first.
 */
function resolveEsmPackage(specifier: string): string {
  const cwd = process.cwd();
  const roots = [
    cwd,
    path.resolve(cwd, "dashboard"),
    path.resolve(cwd, ".."),
    path.resolve(__dirname, "../.."),
    path.resolve(__dirname, "../../.."),
    path.resolve(__dirname, "../../../.."),
  ];

  const seen = new Set<string>();
  for (const root of roots) {
    const normalized = path.resolve(root);
    if (seen.has(normalized)) {
      continue;
    }
    seen.add(normalized);
    try {
      const require = createRequire(path.join(normalized, "package.json"));
      return require.resolve(specifier);
    } catch {
      // try the next install root
    }
  }

  throw new Error(`Cannot resolve package '${specifier}' from ${cwd}`);
}

export async function importEsm<T = unknown>(specifier: string): Promise<T> {
  try {
    const file = resolveEsmPackage(specifier);
    return (await import(pathToFileURL(file).href)) as T;
  } catch (resolvedError) {
    try {
      const load = new Function("id", "return import(id)") as (id: string) => Promise<T>;
      return await load(specifier);
    } catch {
      throw resolvedError;
    }
  }
}
