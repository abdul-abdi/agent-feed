import { test, expect } from "bun:test";
import {
  Reader,
  buildSnapshot,
  parseSnapshot,
  buildFeed,
  type Entry,
} from "../src/index.ts";
import { generateKeypair, didDocumentFromKeypair } from "../src/crypto.ts";

const ORIGIN = "https://example.com";

async function ingestedReader(entries: Entry[]) {
  const kp = await generateKeypair();
  const didDoc = didDocumentFromKeypair(ORIGIN, kp);
  const xml = await buildFeed({
    feedId: didDoc.id,
    title: "example",
    updated: "2026-04-27T12:00:00Z",
    feedStatus: "active",
    specVersion: 0,
    entries,
    keypair: kp,
  });
  const reader = new Reader();
  await reader.ingest({ origin: ORIGIN, xml, didDocument: didDoc });
  return { reader, kp, didDoc };
}

test("snapshot reflects current canonical state from feed", async () => {
  const { reader } = await ingestedReader([
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
  const snap = reader.snapshot(ORIGIN, {
    id: "did:web:example.com",
    generatedAt: "2026-04-27T14:00:00Z",
  });
  expect(snap).toBeDefined();
  expect(snap!["spec-version"]).toBe(0);
  expect(snap!.endpoints).toHaveLength(1);
  expect(snap!.endpoints[0]!.version).toBe("1.1");
  expect(snap!["by-protocol"]).toEqual({ rest: "orders-api" });
  expect(snap!["feed-status"]).toBe("active");
});

test("buildSnapshot → parseSnapshot roundtrip verifies", async () => {
  const { reader, kp, didDoc } = await ingestedReader([
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
  const snap = reader.snapshot(ORIGIN, {
    id: didDoc.id,
    generatedAt: "2026-04-27T14:00:00Z",
  })!;
  const text = await buildSnapshot(snap, kp);
  const parsed = await parseSnapshot(text, { didDocument: didDoc });
  expect(parsed.verified).toBe(true);
  expect(parsed.snapshot.endpoints).toHaveLength(1);
});

test("tampered snapshot fails verification", async () => {
  const { reader, kp, didDoc } = await ingestedReader([
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
  const snap = reader.snapshot(ORIGIN, {
    id: didDoc.id,
    generatedAt: "2026-04-27T14:00:00Z",
  })!;
  const text = await buildSnapshot(snap, kp);
  const tampered = text.replace('"version": "1.0"', '"version": "9.9"');
  const parsed = await parseSnapshot(tampered, { didDocument: didDoc });
  expect(parsed.verified).toBe(false);
});

test("snapshot for unknown origin is undefined", () => {
  const r = new Reader();
  expect(
    r.snapshot("https://nope.example.com", { id: "did:web:nope" }),
  ).toBeUndefined();
});
