import type { Aggregator } from "./aggregator.ts";
import type { DidDocument } from "../../../src/index.ts";

export interface CrawlResult {
  origin: string;
  ok: boolean;
  error?: string;
  verifiedEntries?: number;
  rejectedEntries?: number;
}

export async function crawlOrigin(
  agg: Aggregator,
  origin: string,
  fetchImpl: typeof fetch = fetch,
): Promise<CrawlResult> {
  try {
    const [didRes, feedRes] = await Promise.all([
      fetchImpl(new URL("/.well-known/did.json", origin)),
      fetchImpl(new URL("/.well-known/agent-feed.xml", origin)),
    ]);
    if (!didRes.ok)
      return { origin, ok: false, error: `did.json ${didRes.status}` };
    if (!feedRes.ok)
      return { origin, ok: false, error: `agent-feed.xml ${feedRes.status}` };

    const didDoc = (await didRes.json()) as DidDocument;
    const xml = await feedRes.text();
    const result = await agg.ingest({ origin, xml, didDocument: didDoc });
    return {
      origin,
      ok: true,
      verifiedEntries: result.verifiedEntries,
      rejectedEntries: result.rejectedEntries,
    };
  } catch (err) {
    return {
      origin,
      ok: false,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

export async function crawlAll(
  agg: Aggregator,
  origins: string[],
  fetchImpl: typeof fetch = fetch,
): Promise<CrawlResult[]> {
  return Promise.all(origins.map((o) => crawlOrigin(agg, o, fetchImpl)));
}
