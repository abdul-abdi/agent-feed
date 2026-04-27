import { test, expect } from "bun:test";
import {
  Reader,
  withFeedRecovery,
  buildFeed,
  type Entry,
} from "../src/index.ts";
import { generateKeypair, didDocumentFromKeypair } from "../src/crypto.ts";

const ORIGIN = "https://example.com";

async function reader(entries: Entry[]) {
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
  const r = new Reader();
  await r.ingest({ origin: ORIGIN, xml, didDocument: didDoc });
  return r;
}

function fakeFetch(responses: Record<string, () => Response>): typeof fetch {
  return (async (input: any) => {
    const url = typeof input === "string" ? input : input.url;
    const handler = responses[url];
    if (!handler) return new Response("not found", { status: 404 });
    return handler();
  }) as unknown as typeof fetch;
}

test("404 with replacement triggers retry against replacement URL", async () => {
  const past = new Date(Date.now() - 86_400_000).toISOString();
  const r = await reader([
    {
      id: "1",
      type: "endpoint-announcement",
      updated: "2026-04-27T12:00:00Z",
      payload: {
        "asserted-at": "2026-04-27T12:00:00Z",
        endpoint: "https://example.com/v1/orders",
        "endpoint-id": "v1-orders",
        protocol: "rest",
        version: "1.0",
      },
    },
    {
      id: "2",
      type: "endpoint-announcement",
      updated: "2026-04-27T12:30:00Z",
      payload: {
        "asserted-at": "2026-04-27T12:30:00Z",
        endpoint: "https://example.com/v2/orders",
        "endpoint-id": "v2-orders",
        protocol: "rest-v2",
        version: "2.0",
      },
    },
    {
      id: "3",
      type: "deprecation",
      updated: "2026-04-27T13:00:00Z",
      payload: {
        "announced-at": "2026-04-27T13:00:00Z",
        "endpoint-id": "v1-orders",
        replacement: "v2-orders",
        sunset: past,
      },
    },
  ]);

  const f = fakeFetch({
    "https://example.com/v2/orders": () =>
      Response.json({ id: "ord", total: 1, currency: "USD" }),
  });

  const recovered = withFeedRecovery(r, f, { origin: ORIGIN });
  const res = await recovered("https://example.com/v1/orders");
  expect(res.status).toBe(200);
  const body = (await res.json()) as Record<string, unknown>;
  expect(body.currency).toBe("USD");
});

test("404 with no replacement returns the original 404", async () => {
  const r = await reader([]);
  const f = fakeFetch({});
  const recovered = withFeedRecovery(r, f, { origin: ORIGIN });
  const res = await recovered("https://example.com/missing");
  expect(res.status).toBe(404);
});

test("non-404 success bypasses recovery", async () => {
  const r = await reader([]);
  let calls = 0;
  const f: typeof fetch = (async (_url: any) => {
    calls += 1;
    return Response.json({ ok: true });
  }) as unknown as typeof fetch;
  const recovered = withFeedRecovery(r, f, { origin: ORIGIN });
  const res = await recovered("https://example.com/anywhere");
  expect(res.status).toBe(200);
  expect(calls).toBe(1);
});

test("recovery only retries once even if replacement also 404s", async () => {
  const past = new Date(Date.now() - 86_400_000).toISOString();
  const r = await reader([
    {
      id: "1",
      type: "endpoint-announcement",
      updated: "2026-04-27T12:00:00Z",
      payload: {
        "asserted-at": "2026-04-27T12:00:00Z",
        endpoint: "https://example.com/v1/orders",
        "endpoint-id": "v1",
        protocol: "rest",
        version: "1.0",
      },
    },
    {
      id: "2",
      type: "endpoint-announcement",
      updated: "2026-04-27T12:30:00Z",
      payload: {
        "asserted-at": "2026-04-27T12:30:00Z",
        endpoint: "https://example.com/v2/orders",
        "endpoint-id": "v2",
        protocol: "rest-v2",
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

  let calls = 0;
  const f: typeof fetch = (async (_input: any) => {
    calls += 1;
    return new Response("gone", { status: 404 });
  }) as unknown as typeof fetch;

  const recovered = withFeedRecovery(r, f, { origin: ORIGIN });
  const res = await recovered("https://example.com/v1/orders");
  expect(res.status).toBe(404);
  expect(calls).toBe(2); // original + one retry, no infinite loop
});
