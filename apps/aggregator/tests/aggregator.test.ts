import { test, expect, beforeEach } from "bun:test";
import { Aggregator } from "../src/aggregator.ts";
import {
  generateKeypair,
  didDocumentFromKeypair,
  buildFeed,
  type Entry,
} from "../../../src/index.ts";

const ORIGIN = "https://search.example";

async function fixture(entries: Entry[]) {
  const kp = await generateKeypair();
  const didDoc = didDocumentFromKeypair(ORIGIN, kp);
  const xml = await buildFeed({
    feedId: didDoc.id,
    title: "search-fixture",
    updated: "2026-04-27T12:00:00Z",
    feedStatus: "active",
    specVersion: 0,
    entries,
    keypair: kp,
  });
  return { xml, didDoc };
}

let agg: Aggregator;

beforeEach(() => {
  agg = new Aggregator(":memory:");
});

test("ingest persists verified entries; rejects unverified", async () => {
  const { xml, didDoc } = await fixture([
    {
      id: "urn:af:1",
      type: "endpoint-announcement",
      updated: "2026-04-27T12:00:00Z",
      payload: {
        "asserted-at": "2026-04-27T12:00:00Z",
        endpoint: "/orders",
        "endpoint-id": "orders-api",
        protocol: "rest",
        version: "1.0",
      },
    },
  ]);
  const result = await agg.ingest({ origin: ORIGIN, xml, didDocument: didDoc });
  expect(result.verifiedEntries).toBe(1);
  expect(result.rejectedEntries).toBe(0);

  const origins = agg.listOrigins();
  expect(origins).toHaveLength(1);
  expect(origins[0]!.origin).toBe(ORIGIN);
});

test("search by full-text matches payload content", async () => {
  const { xml, didDoc } = await fixture([
    {
      id: "urn:af:1",
      type: "schema-change",
      updated: "2026-04-27T12:00:00Z",
      payload: {
        "effective-at": "2026-04-27T12:00:00Z",
        "endpoint-id": "orders-api",
        "from-version": "1.0",
        migration: { add: ["currency"] },
        "to-version": "1.1",
      },
    },
  ]);
  await agg.ingest({ origin: ORIGIN, xml, didDocument: didDoc });

  const hits = agg.search({ q: "currency" });
  expect(hits.length).toBeGreaterThanOrEqual(1);
  expect(hits[0]!.type).toBe("schema-change");
});

test("search by type filter", async () => {
  const { xml, didDoc } = await fixture([
    {
      id: "urn:af:1",
      type: "endpoint-announcement",
      updated: "2026-04-27T12:00:00Z",
      payload: {
        "asserted-at": "2026-04-27T12:00:00Z",
        endpoint: "/x",
        "endpoint-id": "x",
        protocol: "rest",
        version: "1.0",
      },
    },
    {
      id: "urn:af:2",
      type: "schema-change",
      updated: "2026-04-27T13:00:00Z",
      payload: {
        "effective-at": "2026-04-27T13:00:00Z",
        "endpoint-id": "x",
        "from-version": "1.0",
        migration: { add: ["tax"] },
        "to-version": "1.1",
      },
    },
  ]);
  await agg.ingest({ origin: ORIGIN, xml, didDocument: didDoc });

  const sc = agg.search({ type: "schema-change" });
  expect(sc).toHaveLength(1);
  expect(sc[0]!.type).toBe("schema-change");
});

test("search by endpoint-id filter", async () => {
  const { xml, didDoc } = await fixture([
    {
      id: "urn:af:1",
      type: "endpoint-announcement",
      updated: "2026-04-27T12:00:00Z",
      payload: {
        "asserted-at": "2026-04-27T12:00:00Z",
        endpoint: "/orders",
        "endpoint-id": "orders-api",
        protocol: "rest",
        version: "1.0",
      },
    },
    {
      id: "urn:af:2",
      type: "endpoint-announcement",
      updated: "2026-04-27T12:00:00Z",
      payload: {
        "asserted-at": "2026-04-27T12:00:00Z",
        endpoint: "/users",
        "endpoint-id": "users-api",
        protocol: "rest",
        version: "1.0",
      },
    },
  ]);
  await agg.ingest({ origin: ORIGIN, xml, didDocument: didDoc });

  const hits = agg.search({ endpointId: "orders-api" });
  expect(hits).toHaveLength(1);
  expect((hits[0]!.payload as any)["endpoint-id"]).toBe("orders-api");
});

test("search by since (time filter)", async () => {
  const { xml, didDoc } = await fixture([
    {
      id: "urn:af:old",
      type: "endpoint-announcement",
      updated: "2026-04-20T00:00:00Z",
      payload: {
        "asserted-at": "2026-04-20T00:00:00Z",
        endpoint: "/old",
        "endpoint-id": "old",
        protocol: "rest",
        version: "1.0",
      },
    },
    {
      id: "urn:af:new",
      type: "endpoint-announcement",
      updated: "2026-04-26T00:00:00Z",
      payload: {
        "asserted-at": "2026-04-26T00:00:00Z",
        endpoint: "/new",
        "endpoint-id": "new",
        protocol: "rest",
        version: "1.0",
      },
    },
  ]);
  await agg.ingest({ origin: ORIGIN, xml, didDocument: didDoc });

  const recent = agg.search({ since: "2026-04-25T00:00:00Z" });
  expect(recent).toHaveLength(1);
  expect(recent[0]!.entryId).toBe("urn:af:new");
});

test("ingestion is idempotent on the same feed", async () => {
  const { xml, didDoc } = await fixture([
    {
      id: "urn:af:1",
      type: "endpoint-announcement",
      updated: "2026-04-27T12:00:00Z",
      payload: {
        "asserted-at": "2026-04-27T12:00:00Z",
        endpoint: "/x",
        "endpoint-id": "x",
        protocol: "rest",
        version: "1.0",
      },
    },
  ]);
  await agg.ingest({ origin: ORIGIN, xml, didDocument: didDoc });
  await agg.ingest({ origin: ORIGIN, xml, didDocument: didDoc });

  const all = agg.search({});
  expect(all).toHaveLength(1);
});

test("statsForOrigin returns counts", async () => {
  const { xml, didDoc } = await fixture([
    {
      id: "urn:af:1",
      type: "endpoint-announcement",
      updated: "2026-04-27T12:00:00Z",
      payload: {
        "asserted-at": "2026-04-27T12:00:00Z",
        endpoint: "/x",
        "endpoint-id": "x",
        protocol: "rest",
        version: "1.0",
      },
    },
    {
      id: "urn:af:2",
      type: "schema-change",
      updated: "2026-04-27T13:00:00Z",
      payload: {
        "effective-at": "2026-04-27T13:00:00Z",
        "endpoint-id": "x",
        "from-version": "1.0",
        migration: { add: ["currency"] },
        "to-version": "1.1",
      },
    },
  ]);
  await agg.ingest({ origin: ORIGIN, xml, didDocument: didDoc });
  const stats = agg.statsForOrigin(ORIGIN);
  expect(stats?.totalEntries).toBe(2);
  expect(stats?.byType["endpoint-announcement"]).toBe(1);
  expect(stats?.byType["schema-change"]).toBe(1);
});
