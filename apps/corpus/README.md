# agent-corpus

Sibling plane to `agent-feed-aggregator`. Where the aggregator indexes **signed claims**, the corpus indexes **observations**: third-party-attested agent metadata scraped from public sources (MCP registry, A2A registry, GitHub README catalogs).

**Trust property is deliberately weaker.** Observations carry the witness that produced them (`source`, `sourceFetchedFrom`) and are explicitly _not_ cryptographically attributable to the origin. They are useful for: corpus search, cross-source divergence detection, training-grade dataset, onboarding ramp from observed publishers to signed publishers.

## What this is and is not

- **Is:** a temporal record of what N public sources say about agent endpoints. The product's value is in the _diffs_ — when two sources disagree about the same origin, that's the highest-signal artifact (Carmack's R2 reconciliation insight, Karpathy's hard-negative-miner framing).
- **Is not:** a registry. Observations don't speak for the origin; they speak for the source.
- **Is not:** a competitor to MCP registry / A2A registry / awesome-mcp-servers. We index _them_, with consent invariants.

## Quickstart

```bash
SEED=1 PORT=4300 bun apps/corpus/src/server.ts
# open http://localhost:4300
```

Without `SEED=1`, the server runs against an existing database (or empty one). With `SEED=1`, it crawls all four configured sources on boot.

## Sources currently crawled

| Source                         | URL                                           | Consent posture                                                    |
| ------------------------------ | --------------------------------------------- | ------------------------------------------------------------------ |
| MCP official registry          | `registry.modelcontextprotocol.io/v0/servers` | published-for-consumption (REST API, RFC 3339 cursors)             |
| A2A public registry            | `a2aregistry.org/api/agents`                  | published-for-consumption (open JSON API)                          |
| `punkpeye/awesome-mcp-servers` | GitHub raw README                             | maintainer-signaled "share me" (curated list under MIT-equivalent) |
| `modelcontextprotocol/servers` | GitHub raw README                             | official, public                                                   |

**Not crawled** (consent invariant deferred per Taleb in the corpus roundtable): Smithery, Glama, mcpmarket, and any HTML directory marketing itself as a curated product. Written permission required first.

## API

| Method | Path                                                  | Purpose                                                                      |
| ------ | ----------------------------------------------------- | ---------------------------------------------------------------------------- |
| `GET`  | `/api/corpus/search?q=&source=&origin=&since=&limit=` | full-text + structured search across observations                            |
| `GET`  | `/api/corpus/origin?origin=...`                       | per-origin observations + cross-source divergences                           |
| `GET`  | `/api/corpus/counts`                                  | by-source counts                                                             |
| `GET`  | `/api/divergence?origin=...`                          | cross-source divergences only                                                |
| `POST` | `/api/corpus/crawl`                                   | trigger crawl now                                                            |
| `POST` | `/api/corpus/optout`                                  | `{ "origin": "..." }` — deletes existing observations and blocks future ones |

## Trust model (per the corpus roundtable, 2026-04-27)

- Single SQLite store with NOT NULL `provenance`-like fields — every row is `{ source, source_record_id }`-keyed and carries `originResolution`, `observedAt`, `sourceFetchedFrom`. Carmack-on-storage.
- Separate API path under `/api/corpus/*` — never returns signed entries. Hickey-on-API. Storage joins, surfaces don't.
- Cross-source divergence is the headline product: per-field disagreement across sources for the same origin.
- Opt-out is honored as an invariant: an opted-out origin cannot be re-ingested even if it appears in a future crawl. (Taleb's consent invariant, applied operationally.)

## What was deliberately deferred

- **Conversion bot** (autonomous PRs to strangers' repos). Killed unanimously in the roundtable.
- **HTML scraping of curated directories** (Smithery / Glama / mcpmarket). Written permission first.
- **A real-time streaming ingest.** Daily-cadence default with adaptive freshness for high-divergence origins is sufficient until measured otherwise.
- **Foundation-model training pitch.** The corpus is fine-tuning data for niche tasks (schema-drift detection, breaking-change prediction) — Karpathy's honest downgrade.

## Phase 0 artifacts

The schema design above was _informed by, not predicted before_, the data. See `apps/corpus/phase0/DIALECTS.md` for the dialect survey written before any storage code was committed (Karpathy's gate-zero).

## Kill criteria

Per `ROADMAP.md` discipline:

- If <50 unique origin lookups in month 1 → corpus isn't the wedge; kill.
- If zero publisher-claim attempts in month 1 → onboarding-ramp thesis fails; kill.
- Any sustained C&D / aggressive blocklisting → freeze, audit, possibly kill.

## Known live result (2026-04-28 demo)

Cross-source divergence detected on real data: `https://github.com/Auctalis/nocturnusai` appears in both `punkpeye/awesome-mcp-servers` and the MCP registry with conflicting `name` and `description`. The same server tells two stories depending on which source you read. This is the wedge — the agent operator is the only consumer that crosses sources.
