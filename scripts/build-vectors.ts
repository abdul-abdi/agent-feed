#!/usr/bin/env bun
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import {
  generateKeypair,
  didDocumentFromKeypair,
  buildFeed,
  buildSnapshot,
  Reader,
  type Entry,
} from "../src/index.ts";

const ORIGIN = "https://vector.example";
const VECTORS = join(import.meta.dir, "..", "tests", "vectors");

async function vector(
  name: string,
  description: string,
  manifestExtra: any,
  build: (
    kp: Awaited<ReturnType<typeof generateKeypair>>,
    didDoc: any,
  ) => Promise<{ feed?: string; snapshot?: string }>,
) {
  const dir = join(VECTORS, name);
  mkdirSync(dir, { recursive: true });
  const kp = await generateKeypair();
  const didDoc = didDocumentFromKeypair(ORIGIN, kp);
  const { feed, snapshot } = await build(kp, didDoc);
  writeFileSync(join(dir, "did.json"), JSON.stringify(didDoc, null, 2));
  if (feed) writeFileSync(join(dir, "agent-feed.xml"), feed);
  if (snapshot) writeFileSync(join(dir, "agent-card.json"), snapshot);
  writeFileSync(
    join(dir, "manifest.json"),
    JSON.stringify(
      { name, description, kind: feed ? "feed" : "snapshot", ...manifestExtra },
      null,
      2,
    ),
  );
  console.log(`✓ ${name}`);
}

const T0 = "2026-04-27T12:00:00Z";
const T1 = "2026-04-27T13:00:00Z";

await vector(
  "01-empty-active-feed",
  "Empty feed with status active and no entries.",
  { expect: { feedStatus: "active", verifiedEntryCount: 0 } },
  async (kp, didDoc) => ({
    feed: await buildFeed({
      feedId: didDoc.id,
      title: "vector",
      updated: T0,
      feedStatus: "active",
      specVersion: 0,
      entries: [],
      keypair: kp,
    }),
  }),
);

await vector(
  "02-single-endpoint-announcement",
  "One endpoint-announcement entry. Reader resolves canonical endpoint.",
  {
    expect: {
      feedStatus: "active",
      verifiedEntryCount: 1,
      canonicalEndpoint: { protocol: "rest", expected: "/api/orders" },
      schemaVersion: { endpointId: "orders-api", expected: "1.0" },
    },
  },
  async (kp, didDoc) => {
    const entries: Entry[] = [
      {
        id: "urn:af:vector:1",
        type: "endpoint-announcement",
        updated: T0,
        payload: {
          "asserted-at": T0,
          endpoint: "/api/orders",
          "endpoint-id": "orders-api",
          protocol: "rest",
          version: "1.0",
        },
      },
    ];
    return {
      feed: await buildFeed({
        feedId: didDoc.id,
        title: "vector",
        updated: T0,
        feedStatus: "active",
        specVersion: 0,
        entries,
        keypair: kp,
      }),
    };
  },
);

await vector(
  "03-schema-change-mismatch",
  "Endpoint announced at v1.0, schema-change to v1.1 (add currency). Live response without currency MUST fire mismatch with fallback v1.0.",
  {
    expect: {
      feedStatus: "active",
      verifiedEntryCount: 2,
      schemaVersion: { endpointId: "orders-api", expected: "1.1" },
      mismatchOnLiveResponse: {
        endpointId: "orders-api",
        body: { id: "ord", total: 100 },
        expectedFallback: "1.0",
      },
    },
  },
  async (kp, didDoc) => {
    const entries: Entry[] = [
      {
        id: "urn:af:vector:1",
        type: "endpoint-announcement",
        updated: T0,
        payload: {
          "asserted-at": T0,
          endpoint: "/api/orders",
          "endpoint-id": "orders-api",
          protocol: "rest",
          version: "1.0",
        },
      },
      {
        id: "urn:af:vector:2",
        type: "schema-change",
        updated: T1,
        payload: {
          "effective-at": T1,
          "endpoint-id": "orders-api",
          "from-version": "1.0",
          migration: { add: ["currency"] },
          "to-version": "1.1",
        },
      },
    ];
    return {
      feed: await buildFeed({
        feedId: didDoc.id,
        title: "vector",
        updated: T1,
        feedStatus: "active",
        specVersion: 0,
        entries,
        keypair: kp,
      }),
    };
  },
);

await vector(
  "04-terminated-feed",
  "Feed with status terminated. Reader MUST drop trust; canonical endpoint lookup returns undefined.",
  {
    expect: {
      feedStatus: "terminated",
      verifiedEntryCount: 1,
      canonicalEndpoint: { protocol: "rest", expected: null },
    },
  },
  async (kp, didDoc) => {
    const entries: Entry[] = [
      {
        id: "urn:af:vector:1",
        type: "endpoint-announcement",
        updated: T0,
        payload: {
          "asserted-at": T0,
          endpoint: "/api/orders",
          "endpoint-id": "orders-api",
          protocol: "rest",
          version: "1.0",
        },
      },
    ];
    return {
      feed: await buildFeed({
        feedId: didDoc.id,
        title: "vector",
        updated: T0,
        feedStatus: "terminated",
        specVersion: 0,
        entries,
        keypair: kp,
      }),
    };
  },
);

await vector(
  "05-snapshot-from-state",
  "Signed agent-card.json snapshot derived from a feed with one endpoint at v1.0.",
  {},
  async (kp, didDoc) => {
    const entries: Entry[] = [
      {
        id: "urn:af:vector:1",
        type: "endpoint-announcement",
        updated: T0,
        payload: {
          "asserted-at": T0,
          endpoint: "/api/orders",
          "endpoint-id": "orders-api",
          protocol: "rest",
          version: "1.0",
        },
      },
    ];
    const xml = await buildFeed({
      feedId: didDoc.id,
      title: "vector",
      updated: T0,
      feedStatus: "active",
      specVersion: 0,
      entries,
      keypair: kp,
    });
    const reader = new Reader();
    await reader.ingest({ origin: ORIGIN, xml, didDocument: didDoc });
    const snap = reader.snapshot(ORIGIN, { id: didDoc.id, generatedAt: T0 })!;
    return { snapshot: await buildSnapshot(snap, kp) };
  },
);

console.log(`\nWrote vectors to ${VECTORS}`);
