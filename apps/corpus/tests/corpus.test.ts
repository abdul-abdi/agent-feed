import { test, expect, beforeEach } from "bun:test";
import { Corpus, type Observation } from "../src/corpus.ts";

const ORIGIN = "https://example.com";

let corpus: Corpus;
beforeEach(() => {
  corpus = new Corpus(":memory:");
});

function obs(o: Partial<Observation>): Observation {
  return {
    origin: ORIGIN,
    originResolution: "mcp-website",
    observedAt: "2026-04-28T12:00:00Z",
    source: "mcp-registry",
    sourceRecordId: "test-1",
    sourceFetchedFrom: "https://registry.modelcontextprotocol.io/v0/servers",
    name: "test",
    raw: { hello: "world" },
    ...o,
  };
}

test("upsert + listForOrigin returns the observation", () => {
  corpus.upsert(obs({ name: "first", description: "a" }));
  const list = corpus.listForOrigin(ORIGIN);
  expect(list).toHaveLength(1);
  expect(list[0]!.name).toBe("first");
  expect(list[0]!.source).toBe("mcp-registry");
});

test("upsert is idempotent on (source, sourceRecordId)", () => {
  corpus.upsert(obs({ sourceRecordId: "x", name: "v1" }));
  corpus.upsert(obs({ sourceRecordId: "x", name: "v1" }));
  expect(corpus.listForOrigin(ORIGIN)).toHaveLength(1);
});

test("upsert overwrites when same (source, sourceRecordId) but content differs", () => {
  corpus.upsert(obs({ sourceRecordId: "x", name: "v1" }));
  corpus.upsert(obs({ sourceRecordId: "x", name: "v2" }));
  const list = corpus.listForOrigin(ORIGIN);
  expect(list).toHaveLength(1);
  expect(list[0]!.name).toBe("v2");
});

test("listForOrigin filters by origin only", () => {
  corpus.upsert(obs({ origin: "https://a.com", sourceRecordId: "1" }));
  corpus.upsert(obs({ origin: "https://b.com", sourceRecordId: "2" }));
  expect(corpus.listForOrigin("https://a.com")).toHaveLength(1);
  expect(corpus.listForOrigin("https://b.com")).toHaveLength(1);
});

test("listBySource filters by source", () => {
  corpus.upsert(obs({ source: "mcp-registry", sourceRecordId: "1" }));
  corpus.upsert(obs({ source: "a2a-registry", sourceRecordId: "2" }));
  expect(corpus.listBySource("mcp-registry")).toHaveLength(1);
  expect(corpus.listBySource("a2a-registry")).toHaveLength(1);
});

test("search by full-text matches the raw payload content", () => {
  corpus.upsert(obs({ name: "matchme-name", description: "a special widget" }));
  const hits = corpus.search({ q: "special" });
  expect(hits.length).toBeGreaterThanOrEqual(1);
  expect(hits[0]!.name).toBe("matchme-name");
});

test("search by source filter", () => {
  corpus.upsert(
    obs({ source: "mcp-registry", sourceRecordId: "1", name: "alpha" }),
  );
  corpus.upsert(
    obs({ source: "a2a-registry", sourceRecordId: "2", name: "alpha" }),
  );
  expect(corpus.search({ source: "mcp-registry" })).toHaveLength(1);
});

test("countsBySource returns per-source counts", () => {
  corpus.upsert(obs({ source: "mcp-registry", sourceRecordId: "1" }));
  corpus.upsert(obs({ source: "mcp-registry", sourceRecordId: "2" }));
  corpus.upsert(obs({ source: "a2a-registry", sourceRecordId: "3" }));
  const counts = corpus.countsBySource();
  expect(counts["mcp-registry"]).toBe(2);
  expect(counts["a2a-registry"]).toBe(1);
});

test("isOptedOut blocks upsert when origin is opted out", () => {
  corpus.optOut("https://blocked.example.com");
  const res = corpus.upsert(obs({ origin: "https://blocked.example.com" }));
  expect(res.applied).toBe(false);
  expect(res.reason).toBe("opted-out");
  expect(corpus.listForOrigin("https://blocked.example.com")).toHaveLength(0);
});

test("opt-out removes existing observations for that origin", () => {
  corpus.upsert(obs({ origin: "https://will-block.example.com" }));
  expect(corpus.listForOrigin("https://will-block.example.com")).toHaveLength(
    1,
  );
  corpus.optOut("https://will-block.example.com");
  expect(corpus.listForOrigin("https://will-block.example.com")).toHaveLength(
    0,
  );
});
