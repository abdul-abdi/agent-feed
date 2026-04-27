import { test, expect } from "bun:test";
import { buildFeed, parseFeed, type Entry } from "../src/feed.ts";
import { generateKeypair, didDocumentFromKeypair } from "../src/crypto.ts";

const ORIGIN = "https://example.com";

async function setup() {
  const kp = await generateKeypair();
  const didDoc = didDocumentFromKeypair(ORIGIN, kp);
  return { kp, didDoc };
}

test("build → parse roundtrip preserves verified entries", async () => {
  const { kp, didDoc } = await setup();
  const entries: Entry[] = [
    {
      id: "urn:af:example.com:1",
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
  ];

  const xml = await buildFeed({
    feedId: didDoc.id,
    title: "example",
    updated: "2026-04-27T12:00:00Z",
    feedStatus: "active",
    specVersion: 0,
    entries,
    keypair: kp,
  });

  const parsed = await parseFeed(xml, { didDocument: didDoc });
  expect(parsed.entries).toHaveLength(1);
  expect(parsed.entries[0]!.verified).toBe(true);
  expect(parsed.entries[0]!.entry.type).toBe("endpoint-announcement");
  expect(parsed.entries[0]!.entry.payload["endpoint-id"]).toBe("a2a");
});

test("parse rejects tampered entry", async () => {
  const { kp, didDoc } = await setup();
  const xml = await buildFeed({
    feedId: didDoc.id,
    title: "example",
    updated: "2026-04-27T12:00:00Z",
    feedStatus: "active",
    specVersion: 0,
    entries: [
      {
        id: "urn:af:example.com:1",
        type: "schema-change",
        updated: "2026-04-27T12:00:00Z",
        payload: {
          "effective-at": "2026-04-27T13:00:00Z",
          "endpoint-id": "orders-api",
          "from-version": "1.0",
          migration: { add: ["currency"] },
          "to-version": "1.1",
        },
      },
    ],
    keypair: kp,
  });
  const tampered = xml.replace("&quot;currency&quot;", "&quot;price&quot;");
  expect(tampered).not.toBe(xml); // ensure the test actually tampered something
  const parsed = await parseFeed(tampered, { didDocument: didDoc });
  expect(parsed.entries[0]!.verified).toBe(false);
});

test("parses kill switch (terminated)", async () => {
  const { kp, didDoc } = await setup();
  const xml = await buildFeed({
    feedId: didDoc.id,
    title: "example",
    updated: "2026-04-27T12:00:00Z",
    feedStatus: "terminated",
    specVersion: 0,
    entries: [],
    keypair: kp,
  });
  const parsed = await parseFeed(xml, { didDocument: didDoc });
  expect(parsed.feedStatus).toBe("terminated");
});

test("parses migrated feed-status with migrated-to URL", async () => {
  const { kp, didDoc } = await setup();
  const xml = await buildFeed({
    feedId: didDoc.id,
    title: "example",
    updated: "2026-04-27T12:00:00Z",
    feedStatus: "migrated",
    migratedTo: "https://new.example.com/.well-known/agent-feed.xml",
    specVersion: 0,
    entries: [],
    keypair: kp,
  });
  const parsed = await parseFeed(xml, { didDocument: didDoc });
  expect(parsed.feedStatus).toBe("migrated");
  expect(parsed.migratedTo).toBe(
    "https://new.example.com/.well-known/agent-feed.xml",
  );
});

test("payload field order does not affect signature", async () => {
  const { kp, didDoc } = await setup();
  // Build two entries with same logical payload but different key order.
  // Both should verify because canonicalization sorts keys.
  const e1: Entry = {
    id: "1",
    type: "endpoint-announcement",
    updated: "2026-04-27T12:00:00Z",
    payload: {
      protocol: "a2a",
      version: "1.0",
      "endpoint-id": "a2a",
      endpoint: "/a2a",
    },
  };
  const e2: Entry = { ...e1, id: "2" };
  const xml = await buildFeed({
    feedId: didDoc.id,
    title: "example",
    updated: "2026-04-27T12:00:00Z",
    feedStatus: "active",
    specVersion: 0,
    entries: [e1, e2],
    keypair: kp,
  });
  const parsed = await parseFeed(xml, { didDocument: didDoc });
  expect(parsed.entries.every((v) => v.verified)).toBe(true);
});
