# agent-feed-aggregator

The search engine for the agentic web. Crawls signed `agent-feed.xml` documents from origins, persists them to SQLite (with FTS5), and exposes a REST + Web UI for querying.

## Quickstart

```bash
# from repo root
PORT=4200 bun apps/aggregator/src/server.ts
# open http://localhost:4200
```

Seed with origins to crawl on boot:

```bash
SEED_ORIGINS=https://shopify.com,https://stripe.com bun apps/aggregator/src/server.ts
```

Persist to a real DB file:

```bash
DB_PATH=/var/lib/agent-feed/agg.sqlite bun apps/aggregator/src/server.ts
```

## API

| Method | Path                                                            | Purpose                                                  |
| ------ | --------------------------------------------------------------- | -------------------------------------------------------- |
| `GET`  | `/`                                                             | Web UI (search, origins, lint, add-origin)               |
| `GET`  | `/api/search?q=&type=&endpointId=&origin=&since=&until=&limit=` | FTS + structured search                                  |
| `GET`  | `/api/origins`                                                  | List all crawled origins with last-ingested timestamps   |
| `GET`  | `/api/origins/<encoded-url>`                                    | Per-origin stats (entry counts by type, last entry time) |
| `POST` | `/api/crawl`                                                    | `{ "origin": "https://…" }` → crawl now, return result   |
| `GET`  | `/api/lint?origin=…`                                            | Run conformance lint on a remote feed                    |

## Architecture (brief)

- **Storage:** `bun:sqlite` with a `entries` table (origin, entry_id, type, endpoint_id, updated, payload, canonical_payload, ingested_at) and a contentless FTS5 virtual table over the JSON payload.
- **Ingestion:** `parseFeed` from `agent-feed`. Only signature-verified entries persist. Idempotent on `(origin, entry_id)`.
- **Crawler:** `fetch` `did.json` + `agent-feed.xml`, ingest. No retry policy, no scheduling — invoke from cron / a worker / on-demand via `/api/crawl`.
- **Search:** combined FTS5 `MATCH` for `q` and structured filters in SQL. Results ordered by `updated DESC`.

## What this is

The temporal-history search engine — find every announcement made by every agent-feed-publishing origin, filtered by type, endpoint, time, and full-text content of the canonical payload.

## What this is NOT

Not a discovery-of-MCP-servers registry. Not a publisher reputation system. Not a payment substrate. Not a status page. See `ROADMAP.md` Tier 4 for the bets that build _on top_ of this.

## Kill criteria (from ROADMAP.md Tier 2 #11)

If <10 paying or actively-using clients use this aggregator within 6 months of public launch, the hosted-aggregator hypothesis is dead and the wedge moves elsewhere.
