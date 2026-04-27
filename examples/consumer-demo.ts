#!/usr/bin/env bun
/**
 * End-to-end demo: an agent surviving a schema change.
 *
 * Pre-req: start the fixture origin first:
 *   bun examples/publisher-fixture.ts &
 *   bun examples/consumer-demo.ts
 */
import { Reader, type DidDocument } from "../src/index.ts";

const ORIGIN = process.env.ORIGIN ?? "http://localhost:4242";

async function fetchFeed(): Promise<{ xml: string; didDoc: DidDocument }> {
  const [didRes, feedRes] = await Promise.all([
    fetch(`${ORIGIN}/.well-known/did.json`),
    fetch(`${ORIGIN}/.well-known/agent-feed.xml`),
  ]);
  if (!didRes.ok || !feedRes.ok) throw new Error("fixture not reachable");
  return {
    didDoc: (await didRes.json()) as DidDocument,
    xml: await feedRes.text(),
  };
}

const reader = new Reader();
reader.on("mismatch", (e) =>
  console.log(
    `   mismatch: missing=${JSON.stringify(e.observedDiscrepancy.expectedButMissing)} fallback=${e.fallbackVersion}`,
  ),
);
reader.on("unverified-entry", (e) =>
  console.log(`   unverified entry ${e.entryId}`),
);

console.log("Step 1: ingest feed");
{
  const { xml, didDoc } = await fetchFeed();
  await reader.ingest({ origin: ORIGIN, xml, didDocument: didDoc });
  console.log(
    `   canonical /rest endpoint: ${reader.canonicalEndpoint(ORIGIN, "rest")}`,
  );
  console.log(
    `   schema version:           ${reader.schemaVersion(ORIGIN, "orders-api")}`,
  );
}

console.log("\nStep 2: call /api/orders (agent expects v1.0)");
{
  const res = await fetch(`${ORIGIN}/api/orders`);
  const body = (await res.json()) as Record<string, unknown>;
  console.log(`   got: ${JSON.stringify(body)}`);
  reader.observeLiveResponse({
    origin: ORIGIN,
    endpointId: "orders-api",
    body,
  });
}

console.log(
  "\nStep 3: world changes — origin migrates v1.0 → v1.1, signs schema-change",
);
await fetch(`${ORIGIN}/admin/migrate`, { method: "POST" });

console.log("\nStep 4: re-ingest feed");
{
  const { xml, didDoc } = await fetchFeed();
  await reader.ingest({ origin: ORIGIN, xml, didDocument: didDoc });
  console.log(
    `   schema version now:       ${reader.schemaVersion(ORIGIN, "orders-api")}`,
  );
  const m = reader.migration(ORIGIN, "orders-api", "1.0", "1.1");
  console.log(`   migration hint:           ${JSON.stringify(m)}`);
}

console.log("\nStep 5: call /api/orders again, observe under new schema");
{
  const res = await fetch(`${ORIGIN}/api/orders`);
  const body = (await res.json()) as Record<string, unknown>;
  console.log(`   got: ${JSON.stringify(body)}`);
  reader.observeLiveResponse({
    origin: ORIGIN,
    endpointId: "orders-api",
    body,
  });
  if ("currency" in body) {
    console.log(
      "\n✓ agent survived schema change — currency field is present.",
    );
  } else {
    console.log("\n✗ schema change not reflected in live response.");
    process.exit(1);
  }
}
