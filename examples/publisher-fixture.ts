#!/usr/bin/env bun
/**
 * Fixture publisher origin: a "Shopify-shaped" site that serves an API,
 * publishes its agent-feed, and (on demand) mutates its API schema while
 * announcing the change in a signed schema-change entry.
 */
import {
  generateKeypair,
  didDocumentFromKeypair,
  buildFeed,
  parseFeed,
  type Entry,
} from "../src/index.ts";

const PORT = Number(process.env.PORT ?? 4242);
const ORIGIN = `http://localhost:${PORT}`;

const kp = await generateKeypair();
const didDoc = didDocumentFromKeypair(ORIGIN, kp);

let schemaVersion: "1.0" | "1.1" = "1.0";

async function rebuildFeed(entries: Entry[]): Promise<string> {
  return buildFeed({
    feedId: didDoc.id,
    title: "fixture origin",
    updated: new Date().toISOString(),
    feedStatus: "active",
    specVersion: 0,
    entries,
    keypair: kp,
  });
}

const initialEntries: Entry[] = [
  {
    id: `urn:af:fixture:${Date.now()}-bootstrap`,
    type: "endpoint-announcement",
    updated: new Date().toISOString(),
    payload: {
      "asserted-at": new Date().toISOString(),
      endpoint: "/api/orders",
      "endpoint-id": "orders-api",
      protocol: "rest",
      version: "1.0",
    },
  },
];

let feedXml = await rebuildFeed(initialEntries);

function order() {
  if (schemaVersion === "1.0") return { id: "ord_1", total: 100 };
  return { id: "ord_1", total: 100, currency: "USD" };
}

const server = Bun.serve({
  port: PORT,
  async fetch(req) {
    const url = new URL(req.url);

    if (url.pathname === "/.well-known/did.json") {
      return Response.json(didDoc);
    }
    if (url.pathname === "/.well-known/agent-feed.xml") {
      return new Response(feedXml, {
        headers: { "content-type": "application/atom+xml" },
      });
    }
    if (url.pathname === "/api/orders") {
      return Response.json(order());
    }
    if (url.pathname === "/admin/migrate" && req.method === "POST") {
      schemaVersion = "1.1";
      const parsed = await parseFeed(feedXml, { didDocument: didDoc });
      const entries: Entry[] = [
        ...parsed.entries.filter((e) => e.verified).map((e) => e.entry),
        {
          id: `urn:af:fixture:${Date.now()}-migrate`,
          type: "schema-change",
          updated: new Date().toISOString(),
          payload: {
            "effective-at": new Date().toISOString(),
            "endpoint-id": "orders-api",
            "from-version": "1.0",
            migration: { add: ["currency"] },
            "to-version": "1.1",
          },
        },
      ];
      feedXml = await rebuildFeed(entries);
      return new Response(`migrated to ${schemaVersion}`, { status: 200 });
    }
    return new Response("Not Found", { status: 404 });
  },
});

console.log(`Fixture origin listening on ${ORIGIN}`);
console.log(`  GET  ${ORIGIN}/.well-known/did.json`);
console.log(`  GET  ${ORIGIN}/.well-known/agent-feed.xml`);
console.log(`  GET  ${ORIGIN}/api/orders   (schema v${schemaVersion})`);
console.log(
  `  POST ${ORIGIN}/admin/migrate  (mutates API + emits signed schema-change)`,
);

void server;
