import { Corpus, type Observation } from "./corpus.ts";
import { mcpRegistryToObservations } from "./sources/mcp-registry.ts";
import { a2aRegistryToObservations } from "./sources/a2a-registry.ts";
import { readmeToObservations } from "./sources/readme.ts";

const UA =
  "agent-corpus/0.1 (+https://github.com/abdullahiabdi/agent-feed; abdullahiabdi1233@gmail.com)";

export interface CrawlSummary {
  source: string;
  ingested: number;
  blockedByOptout: number;
  errors: number;
}

async function get(
  url: string,
  accept = "application/json",
): Promise<Response> {
  return fetch(url, { headers: { "user-agent": UA, accept } });
}

async function ingest(
  corpus: Corpus,
  observations: Observation[],
): Promise<{ ingested: number; blocked: number }> {
  let ingested = 0;
  let blocked = 0;
  for (const o of observations) {
    const r = corpus.upsert(o);
    if (r.applied) ingested += 1;
    else if (r.reason === "opted-out") blocked += 1;
  }
  return { ingested, blocked };
}

export async function crawlMcpRegistry(
  corpus: Corpus,
  maxPages = 5,
): Promise<CrawlSummary> {
  let cursor: string | undefined;
  let page = 0;
  let ingested = 0;
  let blocked = 0;
  let errors = 0;
  while (page < maxPages) {
    const url = new URL("https://registry.modelcontextprotocol.io/v0/servers");
    url.searchParams.set("limit", "100");
    if (cursor) url.searchParams.set("cursor", cursor);
    try {
      const res = await get(url.toString());
      if (!res.ok) {
        errors += 1;
        break;
      }
      const body = (await res.json()) as {
        servers?: any[];
        metadata?: { nextCursor?: string };
      };
      const observations = mcpRegistryToObservations(body, url.toString());
      const r = await ingest(corpus, observations);
      ingested += r.ingested;
      blocked += r.blocked;
      cursor = body.metadata?.nextCursor;
      page += 1;
      if (!cursor) break;
    } catch {
      errors += 1;
      break;
    }
  }
  return { source: "mcp-registry", ingested, blockedByOptout: blocked, errors };
}

export async function crawlA2aRegistry(corpus: Corpus): Promise<CrawlSummary> {
  const url = "https://a2aregistry.org/api/agents";
  try {
    const res = await get(url);
    if (!res.ok)
      return {
        source: "a2a-registry",
        ingested: 0,
        blockedByOptout: 0,
        errors: 1,
      };
    const body = (await res.json()) as { agents?: any[] };
    const observations = a2aRegistryToObservations(body, url);
    const r = await ingest(corpus, observations);
    return {
      source: "a2a-registry",
      ingested: r.ingested,
      blockedByOptout: r.blocked,
      errors: 0,
    };
  } catch {
    return {
      source: "a2a-registry",
      ingested: 0,
      blockedByOptout: 0,
      errors: 1,
    };
  }
}

export async function crawlReadme(
  corpus: Corpus,
  url: string,
): Promise<CrawlSummary> {
  try {
    const res = await get(url, "text/markdown");
    if (!res.ok)
      return {
        source: "github-readme",
        ingested: 0,
        blockedByOptout: 0,
        errors: 1,
      };
    const md = await res.text();
    const observations = readmeToObservations(md, url);
    const r = await ingest(corpus, observations);
    return {
      source: "github-readme",
      ingested: r.ingested,
      blockedByOptout: r.blocked,
      errors: 0,
    };
  } catch {
    return {
      source: "github-readme",
      ingested: 0,
      blockedByOptout: 0,
      errors: 1,
    };
  }
}

export async function crawlAll(corpus: Corpus): Promise<CrawlSummary[]> {
  const results = await Promise.all([
    crawlMcpRegistry(corpus, 5),
    crawlA2aRegistry(corpus),
    crawlReadme(
      corpus,
      "https://raw.githubusercontent.com/punkpeye/awesome-mcp-servers/main/README.md",
    ),
    crawlReadme(
      corpus,
      "https://raw.githubusercontent.com/modelcontextprotocol/servers/main/README.md",
    ),
  ]);
  return results;
}
