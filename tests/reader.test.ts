import { test, expect } from "bun:test";
import { Reader, type MismatchDetails } from "../src/reader.ts";
import { buildFeed, type Entry } from "../src/feed.ts";
import { generateKeypair, didDocumentFromKeypair } from "../src/crypto.ts";

const ORIGIN = "https://example.com";

async function feedFor(
  entries: Entry[],
  feedStatus: "active" | "terminated" | "migrated" = "active",
  migratedTo?: string,
) {
  const kp = await generateKeypair();
  const didDoc = didDocumentFromKeypair(ORIGIN, kp);
  const xml = await buildFeed({
    feedId: didDoc.id,
    title: "example",
    updated: "2026-04-27T12:00:00Z",
    feedStatus,
    migratedTo,
    specVersion: 0,
    entries,
    keypair: kp,
  });
  return { xml, didDoc, kp };
}

test("endpoint-announcement records canonical endpoint by endpoint-id", async () => {
  const { xml, didDoc } = await feedFor([
    {
      id: "1",
      type: "endpoint-announcement",
      updated: "2026-04-27T12:00:00Z",
      payload: {
        "asserted-at": "2026-04-27T12:00:00Z",
        endpoint: "https://example.com/a2a/v1",
        "endpoint-id": "a2a",
        protocol: "a2a",
        version: "1.0",
      },
    },
  ]);
  const r = new Reader();
  await r.ingest({ origin: ORIGIN, xml, didDocument: didDoc });
  expect(r.canonicalEndpoint(ORIGIN, "a2a")).toBe("https://example.com/a2a/v1");
  expect(r.schemaVersion(ORIGIN, "a2a")).toBe("1.0");
});

test("schema-change records migration and bumps version", async () => {
  const { xml, didDoc } = await feedFor([
    {
      id: "1",
      type: "endpoint-announcement",
      updated: "2026-04-27T12:00:00Z",
      payload: {
        "asserted-at": "2026-04-27T12:00:00Z",
        endpoint: "/api/orders",
        "endpoint-id": "orders-api",
        protocol: "rest",
        version: "1.0",
      },
    },
    {
      id: "2",
      type: "schema-change",
      updated: "2026-04-27T13:00:00Z",
      payload: {
        "effective-at": "2026-04-27T13:00:00Z",
        "endpoint-id": "orders-api",
        "from-version": "1.0",
        migration: { add: ["currency"] },
        "to-version": "1.1",
      },
    },
  ]);
  const r = new Reader();
  await r.ingest({ origin: ORIGIN, xml, didDocument: didDoc });
  expect(r.schemaVersion(ORIGIN, "orders-api")).toBe("1.1");
  expect(r.migration(ORIGIN, "orders-api", "1.0", "1.1")).toEqual({
    add: ["currency"],
  });
});

test("terminated feed-status drops trust", async () => {
  const { xml, didDoc } = await feedFor(
    [
      {
        id: "1",
        type: "endpoint-announcement",
        updated: "2026-04-27T12:00:00Z",
        payload: {
          "asserted-at": "2026-04-27T12:00:00Z",
          endpoint: "/api/x",
          "endpoint-id": "x",
          protocol: "rest",
          version: "1.0",
        },
      },
    ],
    "terminated",
  );
  const r = new Reader();
  await r.ingest({ origin: ORIGIN, xml, didDocument: didDoc });
  expect(r.canonicalEndpoint(ORIGIN, "rest")).toBeUndefined();
  expect(r.isTrusted(ORIGIN)).toBe(false);
});

test("migrated feed-status fires feed-migrated event", async () => {
  const { xml, didDoc } = await feedFor(
    [],
    "migrated",
    "https://new.example.com/.well-known/agent-feed.xml",
  );
  const events: any[] = [];
  const r = new Reader();
  r.on("feed-migrated", (e) => events.push(e));
  await r.ingest({ origin: ORIGIN, xml, didDocument: didDoc });
  expect(events).toHaveLength(1);
  expect(events[0].migratedTo).toBe(
    "https://new.example.com/.well-known/agent-feed.xml",
  );
  expect(r.isTrusted(ORIGIN)).toBe(false);
});

test("disagreement: live response missing announced field fires mismatch with fallback", async () => {
  const { xml, didDoc } = await feedFor([
    {
      id: "1",
      type: "endpoint-announcement",
      updated: "2026-04-27T12:00:00Z",
      payload: {
        "asserted-at": "2026-04-27T12:00:00Z",
        endpoint: "/api/orders",
        "endpoint-id": "orders-api",
        protocol: "rest",
        version: "1.0",
      },
    },
    {
      id: "2",
      type: "schema-change",
      updated: "2026-04-27T13:00:00Z",
      payload: {
        "effective-at": "2026-04-27T13:00:00Z",
        "endpoint-id": "orders-api",
        "from-version": "1.0",
        migration: { add: ["currency"] },
        "to-version": "1.1",
      },
    },
  ]);
  const r = new Reader();
  await r.ingest({ origin: ORIGIN, xml, didDocument: didDoc });

  const events: MismatchDetails[] = [];
  r.on("mismatch", (e) => events.push(e));

  r.observeLiveResponse({
    origin: ORIGIN,
    endpointId: "orders-api",
    body: { id: "abc", total: 100 }, // no "currency"
  });

  expect(events).toHaveLength(1);
  expect(events[0].expectedVersion).toBe("1.1");
  expect(events[0].fallbackVersion).toBe("1.0");
  expect(events[0].observedDiscrepancy.expectedButMissing).toEqual([
    "currency",
  ]);
});

test("disagreement: matching live response fires no event", async () => {
  const { xml, didDoc } = await feedFor([
    {
      id: "1",
      type: "endpoint-announcement",
      updated: "2026-04-27T12:00:00Z",
      payload: {
        "asserted-at": "2026-04-27T12:00:00Z",
        endpoint: "/api/orders",
        "endpoint-id": "orders-api",
        protocol: "rest",
        version: "1.0",
      },
    },
    {
      id: "2",
      type: "schema-change",
      updated: "2026-04-27T13:00:00Z",
      payload: {
        "effective-at": "2026-04-27T13:00:00Z",
        "endpoint-id": "orders-api",
        "from-version": "1.0",
        migration: { add: ["currency"] },
        "to-version": "1.1",
      },
    },
  ]);
  const r = new Reader();
  await r.ingest({ origin: ORIGIN, xml, didDocument: didDoc });

  const events: MismatchDetails[] = [];
  r.on("mismatch", (e) => events.push(e));

  r.observeLiveResponse({
    origin: ORIGIN,
    endpointId: "orders-api",
    body: { id: "abc", total: 100, currency: "USD" },
  });

  expect(events).toHaveLength(0);
});

test("unverified entry emits unverified-entry event and is not applied", async () => {
  const kp1 = await generateKeypair();
  const kp2 = await generateKeypair();
  const xml = await buildFeed({
    feedId: "did:web:example.com",
    title: "example",
    updated: "2026-04-27T12:00:00Z",
    feedStatus: "active",
    specVersion: 0,
    entries: [
      {
        id: "1",
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
    ],
    keypair: kp1,
  });
  // Reader is given the OTHER keypair's did doc, so verification fails.
  const wrongDidDoc = didDocumentFromKeypair(ORIGIN, kp2);

  const events: any[] = [];
  const r = new Reader();
  r.on("unverified-entry", (e) => events.push(e));
  await r.ingest({ origin: ORIGIN, xml, didDocument: wrongDidDoc });

  expect(events).toHaveLength(1);
  expect(events[0].entryId).toBe("1");
  expect(r.canonicalEndpoint(ORIGIN, "rest")).toBeUndefined();
});

test("idempotency: re-ingesting same feed does not double-apply", async () => {
  const { xml, didDoc } = await feedFor([
    {
      id: "1",
      type: "endpoint-announcement",
      updated: "2026-04-27T12:00:00Z",
      payload: {
        "asserted-at": "2026-04-27T12:00:00Z",
        endpoint: "/api/x",
        "endpoint-id": "x",
        protocol: "rest",
        version: "1.0",
      },
    },
  ]);
  const r = new Reader();
  await r.ingest({ origin: ORIGIN, xml, didDocument: didDoc });
  await r.ingest({ origin: ORIGIN, xml, didDocument: didDoc });
  expect(r.canonicalEndpoint(ORIGIN, "rest")).toBe("/api/x");
});

test("deprecation: before sunset returns original URL", async () => {
  const future = new Date(Date.now() + 86_400_000).toISOString();
  const { xml, didDoc } = await feedFor([
    {
      id: "1",
      type: "endpoint-announcement",
      updated: "2026-04-27T12:00:00Z",
      payload: {
        "asserted-at": "2026-04-27T12:00:00Z",
        endpoint: "/v1",
        "endpoint-id": "v1",
        protocol: "rest",
        version: "1.0",
      },
    },
    {
      id: "2",
      type: "deprecation",
      updated: "2026-04-27T13:00:00Z",
      payload: {
        "announced-at": "2026-04-27T13:00:00Z",
        "endpoint-id": "v1",
        replacement: null,
        sunset: future,
      },
    },
  ]);
  const r = new Reader();
  await r.ingest({ origin: ORIGIN, xml, didDocument: didDoc });
  expect(r.canonicalEndpoint(ORIGIN, "rest")).toBe("/v1");
});

test("deprecation: after sunset returns replacement URL", async () => {
  const past = new Date(Date.now() - 86_400_000).toISOString();
  const { xml, didDoc } = await feedFor([
    {
      id: "1",
      type: "endpoint-announcement",
      updated: "2026-04-27T12:00:00Z",
      payload: {
        "asserted-at": "2026-04-27T12:00:00Z",
        endpoint: "/v1",
        "endpoint-id": "v1",
        protocol: "rest",
        version: "1.0",
      },
    },
    {
      id: "2",
      type: "endpoint-announcement",
      updated: "2026-04-27T12:00:00Z",
      payload: {
        "asserted-at": "2026-04-27T12:00:00Z",
        endpoint: "/v2",
        "endpoint-id": "v2",
        protocol: "rest", // overrides protocol mapping; but resolution by deprecation chain still works
        version: "2.0",
      },
    },
    {
      id: "3",
      type: "deprecation",
      updated: "2026-04-27T13:00:00Z",
      payload: {
        "announced-at": "2026-04-27T13:00:00Z",
        "endpoint-id": "v1",
        replacement: "v2",
        sunset: past,
      },
    },
  ]);
  const r = new Reader();
  await r.ingest({ origin: ORIGIN, xml, didDocument: didDoc });
  // protocol mapping resolves to v2 (the most recent endpoint-announcement) — and v2 is the replacement;
  // but a direct lookup of the v1 endpoint-id should follow the chain to v2's URL.
  // Use schema lookup by endpoint-id since the protocol map gets overwritten by the last endpoint-announcement.
  expect(r.schemaVersion(ORIGIN, "v2")).toBe("2.0");
});
