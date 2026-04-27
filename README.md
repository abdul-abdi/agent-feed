# agent-feed

> A signed announcement plane for the agentic web. Sites publish at `/.well-known/agent-feed.xml`; agents stop breaking silently when schemas change.

**Status:** v0 reference implementation. Spec, library, CLI, and end-to-end demo. Built in 2026-04 against the verdict of a roundtable (pg + carmack + taleb + hickey).

## Why this exists

Agents in production break silently when sites change their API schema or move endpoints. There is no `robots.txt`-equivalent for telling agents the world has moved. MCP and A2A solved how agents _talk_; nothing solves how the world _announces it changed_.

`agent-feed` is the smallest possible thing that could solve this: a signed Atom feed at `/.well-known/agent-feed.xml`, identity via `did:web`, three entry types (`endpoint-announcement`, `schema-change`, `deprecation`). It complements MCP/A2A; it doesn't compete with them.

## Quickstart

```bash
bun install
bun test                          # 31 conformance tests
bun examples/publisher-fixture.ts &
bun examples/consumer-demo.ts     # watch an agent survive a schema change
```

You should see:

```
Step 1: ingest feed
   canonical /rest endpoint: /api/orders
   schema version:           1.0

Step 2: call /api/orders (agent expects v1.0)
   got: {"id":"ord_1","total":100}

Step 3: world changes — origin migrates v1.0 → v1.1, signs schema-change

Step 4: re-ingest feed
   schema version now:       1.1
   migration hint:           {"add":["currency"]}

Step 5: call /api/orders again, observe under new schema
   got: {"id":"ord_1","total":100,"currency":"USD"}

✓ agent survived schema change — currency field is present.
```

## CLI

```bash
# Generate keypair + did.json + empty feed
bun src/cli.ts init -o https://example.com -d ./public/.well-known

# Append a signed schema-change entry
bun src/cli.ts sign -d ./public/.well-known -t schema-change -p '{
  "effective-at": "2026-04-27T13:00:00Z",
  "endpoint-id": "orders-api",
  "from-version": "1.0",
  "migration": { "add": ["currency"] },
  "to-version": "1.1"
}'

# Verify a remote feed
bun src/cli.ts verify -o https://example.com
```

## Library

```ts
import { Reader } from "agent-feed";

const reader = new Reader();
reader.on("mismatch", (e) => console.warn("schema mismatch", e));
reader.on("unverified-entry", (e) => console.warn("bad signature", e));
reader.on("feed-migrated", (e) => console.log("publisher moved", e.migratedTo));

await reader.ingest({ origin, xml, didDocument });

const endpoint = reader.canonicalEndpoint(origin, "rest");
const version = reader.schemaVersion(origin, "orders-api");
const migration = reader.migration(origin, "orders-api", "1.0", "1.1");
```

After every live API call, hand the response to the reader so it can detect drift between the announced schema and the world:

```ts
reader.observeLiveResponse({ origin, endpointId: "orders-api", body });
```

The reader emits `mismatch` (with `expectedButMissing`, `observedButUnannounced`, `fallbackVersion`) when reality disagrees with the feed. It does not silently coerce, auto-rollback, or re-fetch — it reports facts and lets the agent decide.

## Spec

See [SPEC.md](./SPEC.md). Section ordering is deliberate:

- **§2 Reader's behavioral contract** comes _first_, before the producer schema. Without a reader, the feed is a write-only fact stream with no epistemic status.
- **§4 Resources** explains why the snapshot artifact (`agent-card.json` — current state) and the stream artifact (`agent-feed.xml` — history) are separate URLs and not braided.
- **§10 Open issues** takes a position on each of the live divergences from the roundtable, instead of leaving them as questions.

## Design choices (decided in roundtable, 2026-04-27)

- **Polling-only in v0.** WebSub deferred until measured cost justifies it.
- **Three entry types only:** `endpoint-announcement`, `schema-change`, `deprecation`. No status (different time-constants); no policy (different consumer profile).
- **Detached Ed25519** over canonical JSON. Not HMAC. The signature covers the canonical payload bytes only — not the Atom envelope, title, or timestamps.
- **Snapshot and stream are separate artifacts.** `agent-card.json` is "what is true now"; `agent-feed.xml` is "what became true and when." You cannot reconstruct the second from samples of the first.
- **Reader's behavioral contract is specified before the producer schema.** Producer schema follows from reader behavior, not the other way around.
- **`spec-version` field + `feed-status: terminated|migrated` kill switch in v0.** A publisher can revoke a feed without deleting it.

Roundtable transcript: [`~/Developer/roundtables/2026-04-27-agent-pa-system.md`](../roundtables/2026-04-27-agent-pa-system.md).
Concept page: [`~/Brain/wiki/concepts/agent-pa-system.md`](../../Brain/wiki/concepts/agent-pa-system.md).
Implementation plan: [`docs/plans/2026-04-27-agent-feed-v0.md`](./docs/plans/2026-04-27-agent-feed-v0.md).

## What this is not

- **Not a registry.** No central index. Discovery is by origin URL.
- **Not a discovery protocol.** MCP Server Cards / A2A Agent Cards already cover state-snapshot discovery; `agent-feed` is the temporal-history layer beneath them.
- **Not a status page.** Operational telemetry has different time-constants and consumers.
- **Not a policy engine.** Pricing, rate limits, ToS belong in a separate slow-changing document.

## Roadmap

- **v0** (this): spec + reference reader + signing CLI + fixture demo. Stable.
- **v0.1:** WebSub push as opt-in extension; conformance tests for both poll and push.
- **v0.2:** address [SPEC §10 open issues](./SPEC.md#10-open-issues): lying-publisher detection, multi-domain delegation, polling load on origins.
- **v0.x:** propose into MCP via SEP as a complementary streaming layer once a real consumer commits to reading.

## Stewardship

This repo is owned, not abandoned. The protocol is the gift; ongoing maintenance is the work. Bug reports and discussion welcome; PRs that change the spec require a roundtable.

## License

MIT — to come. Treat as draft until then.
