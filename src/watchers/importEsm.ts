export function importEsm<T = unknown>(specifier: string): Promise<T> {
  const load = new Function("specifier", "return import(specifier)") as (id: string) => Promise<T>;
  return load(specifier);
}
