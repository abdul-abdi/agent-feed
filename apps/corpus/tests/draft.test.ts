import { test, expect, beforeEach } from "bun:test";
import { Corpus, type Observation } from "../src/corpus.ts";
import { draftEndpointAnnouncement } from "../src/draft.ts";

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

test("draft returns null when no observations", () => {
  const draft = draftEndpointAnnouncement(corpus, ORIGIN);
  expect(draft).toBeNull();
});

test("draft picks MCP registry version over README when both present", () => {
  corpus.upsert(
    obs({
      source: "github-readme",
      sourceRecordId: "owner/repo",
      version: "0.5",
      name: "FromReadme",
    }),
  );
  corpus.upsert(
    obs({
      source: "mcp-registry",
      sourceRecordId: "abc",
      version: "1.0",
      name: "FromRegistry",
      endpoints: [
        { url: "https://example.com/mcp", transport: "streamable-http" },
      ],
    }),
  );
  const draft = draftEndpointAnnouncement(corpus, ORIGIN)!;
  expect(draft).not.toBeNull();
  expect(draft.entry.payload.version).toBe("1.0");
  expect(draft.entry.payload.protocol).toBeDefined();
  expect(draft.confidence).toBe("high"); // MCP registry trusted source
  expect(draft.basedOn).toContain("mcp-registry");
});

test("draft uses A2A registry when only A2A available", () => {
  corpus.upsert(
    obs({
      source: "a2a-registry",
      sourceRecordId: "wk",
      version: "0.3",
      protocolVersion: "0.3.0",
      name: "Hotel Bot",
    }),
  );
  const draft = draftEndpointAnnouncement(corpus, ORIGIN)!;
  expect(draft).not.toBeNull();
  expect(draft.entry.payload.version).toBe("0.3");
  expect(draft.basedOn).toContain("a2a-registry");
});

test("draft falls back to README when only README available", () => {
  corpus.upsert(
    obs({
      source: "github-readme",
      sourceRecordId: "owner/repo",
      name: "owner/repo",
      description: "a tool",
    }),
  );
  const draft = draftEndpointAnnouncement(corpus, ORIGIN)!;
  expect(draft).not.toBeNull();
  expect(draft.confidence).toBe("low"); // README is weakest
  expect(draft.basedOn).toEqual(["github-readme"]);
});

test("draft entry shape matches agent-feed v0 endpoint-announcement schema", () => {
  corpus.upsert(
    obs({
      source: "mcp-registry",
      sourceRecordId: "abc",
      version: "1.0",
      name: "Test",
      endpoints: [{ url: "https://example.com/mcp" }],
    }),
  );
  const draft = draftEndpointAnnouncement(corpus, ORIGIN)!;
  // The payload must have: asserted-at, endpoint, endpoint-id, protocol, version
  const p = draft.entry.payload;
  expect(p["asserted-at"]).toBeDefined();
  expect(p.endpoint).toBeDefined();
  expect(p["endpoint-id"]).toBeDefined();
  expect(p.protocol).toBeDefined();
  expect(p.version).toBeDefined();
  // Type field
  expect(draft.entry.type).toBe("endpoint-announcement");
});
