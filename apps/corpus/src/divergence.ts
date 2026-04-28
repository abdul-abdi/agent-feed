import type { Corpus, Observation } from "./corpus.ts";

export interface Divergence {
  origin: string;
  field: "name" | "description" | "version" | "protocolVersion";
  values: string[];
  sources: string[];
}

const FIELDS: Array<
  keyof Pick<
    Observation,
    "name" | "description" | "version" | "protocolVersion"
  >
> = ["name", "description", "version", "protocolVersion"];

export function divergencesForOrigin(
  corpus: Corpus,
  origin: string,
): Divergence[] {
  const obs = corpus.listForOrigin(origin);
  if (obs.length < 2) return [];

  const divs: Divergence[] = [];
  for (const field of FIELDS) {
    const valueBySource = new Map<string, string>();
    for (const o of obs) {
      const v = o[field];
      if (typeof v !== "string" || !v.trim()) continue;
      // Keep first observation per source
      if (!valueBySource.has(o.source)) valueBySource.set(o.source, v);
    }
    if (valueBySource.size < 2) continue;
    const values = [...new Set(valueBySource.values())];
    if (values.length < 2) continue; // all sources agree
    divs.push({
      origin,
      field,
      values,
      sources: [...valueBySource.keys()],
    });
  }
  return divs;
}
