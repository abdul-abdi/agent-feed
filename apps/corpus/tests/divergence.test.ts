import { test, expect, beforeEach } from "bun:test";
import { Corpus, type Observation } from "../src/corpus.ts";
import { divergencesForOrigin } from "../src/divergence.ts";

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
    sourceRecordId: "x",
    sourceFetchedFrom: "https://registry.modelcontextprotocol.io/v0/servers",
    raw: {},
    ...o,
  };
}

test("no divergence when only one source observed", () => {
  corpus.upsert(
    obs({ source: "mcp-registry", sourceRecordId: "1", version: "1.0" }),
  );
  expect(divergencesForOrigin(corpus, ORIGIN)).toHaveLength(0);
});

test("divergence on version field across sources", () => {
  corpus.upsert(
    obs({ source: "mcp-registry", sourceRecordId: "1", version: "1.0" }),
  );
  corpus.upsert(
    obs({
      source: "github-readme",
      sourceRecordId: "owner/repo",
      version: "0.9",
    }),
  );
  const divs = divergencesForOrigin(corpus, ORIGIN);
  expect(divs.find((d) => d.field === "version")).toBeDefined();
  const versionDiv = divs.find((d) => d.field === "version")!;
  expect(versionDiv.values.sort()).toEqual(["0.9", "1.0"]);
  expect(new Set(versionDiv.sources)).toEqual(
    new Set(["mcp-registry", "github-readme"]),
  );
});

test("divergence on name field", () => {
  corpus.upsert(
    obs({ source: "mcp-registry", sourceRecordId: "1", name: "AgentTrust" }),
  );
  corpus.upsert(
    obs({ source: "a2a-registry", sourceRecordId: "wk", name: "Agent Trust" }),
  );
  const divs = divergencesForOrigin(corpus, ORIGIN);
  expect(divs.find((d) => d.field === "name")).toBeDefined();
});

test("agreement on a field does not produce divergence", () => {
  corpus.upsert(
    obs({ source: "mcp-registry", sourceRecordId: "1", description: "same" }),
  );
  corpus.upsert(
    obs({
      source: "github-readme",
      sourceRecordId: "owner/repo",
      description: "same",
    }),
  );
  const divs = divergencesForOrigin(corpus, ORIGIN);
  expect(divs.find((d) => d.field === "description")).toBeUndefined();
});

test("only fields present in 2+ sources are checked for divergence", () => {
  // version present in only one source — no divergence claim possible
  corpus.upsert(
    obs({
      source: "mcp-registry",
      sourceRecordId: "1",
      version: "1.0",
      name: "x",
    }),
  );
  corpus.upsert(
    obs({ source: "a2a-registry", sourceRecordId: "wk", name: "x" }),
  );
  const divs = divergencesForOrigin(corpus, ORIGIN);
  expect(divs.find((d) => d.field === "version")).toBeUndefined();
});
