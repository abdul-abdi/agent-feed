# agent-feed

> **The agentic web's git log.** A signed, append-only announcement layer at `/.well-known/agent-feed.xml`, plus a public observatory of how the existing ecosystem disagrees with itself.

[![status: v0](https://img.shields.io/badge/status-v0-7ee787?style=flat-square)](./CHANGELOG.md)
[![spec: 1190 lines](https://img.shields.io/badge/spec-1190%20lines-58a6ff?style=flat-square)](./SPEC.md)
[![tests: 78/78](https://img.shields.io/badge/tests-78%2F78-7ee787?style=flat-square)](#)
[![ietf: draft-00](https://img.shields.io/badge/ietf-draft--abdi--agent--feed--00-58a6ff?style=flat-square)](./docs/IETF-DRAFT.md)
[![license: MIT](https://img.shields.io/badge/license-MIT-7d8590?style=flat-square)](./LICENSE)

Agent endpoints in 2026 are described across MCP server cards, A2A registries, agents.json, llms.txt, and a half-dozen GitHub catalogs. They drift. They disagree. When an API mutates underneath an agent, the agent breaks silently — there is no `robots.txt`-equivalent for telling agents the world has moved.

**This is that announcement layer** — plus a public observatory of where the existing standards already disagree about the same agent endpoint.

---

## See it

```bash
bun install
PORT=4300 SEED=1 DB_PATH=/tmp/corpus.sqlite bun apps/corpus/src/server.ts &   # observatory + drift dashboard API
PORT=4200 DB_PATH=/tmp/agg.sqlite           bun apps/aggregator/src/server.ts &   # signed-feed search engine
PORT=4100                                   bun apps/web/src/server.ts &           # marketing site

open http://localhost:4100
```

You'll see:

- `http://localhost:4100/` — homepage with a real cross-source divergence in the hero
- `http://localhost:4100/dashboard.html` — paste any GitHub repo or origin → see all observations + highlighted divergences + a draft signed-feed entry to publish
- `http://localhost:4100/spec.html` — RFC-style SPEC viewer with sticky TOC
- `http://localhost:4100/docs.html` — CLI / library / adapter quickstart
- `http://localhost:4100/search.html` — signed-feed aggregator (honest empty state until publishers exist)

The corpus seeds itself from real public sources on first boot: 500 servers from the official MCP registry, 50 agents from the A2A registry, 2,200+ entries from the awesome-mcp-servers GitHub catalog. After it warms up, paste `https://github.com/Auctalis/nocturnusai` into the dashboard — it'll show you the same server described two different ways by two different sources.

## What's actually shipped

|                                                                        | Status                                                                                                                                   |
| ---------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| **Spec (v0)** — [SPEC.md](./SPEC.md)                                   | 1,190 lines · reader contract before producer schema                                                                                     |
| **Library** — TypeScript reference                                     | `src/` · canonicalize · sign/verify · build/parse · Reader                                                                               |
| **CLI** — `agent-feed init / sign / verify / lint / snapshot`          | [src/cli.ts](./src/cli.ts)                                                                                                               |
| **Publisher adapters**                                                 | [Next.js](./adapters/next) · [FastAPI](./adapters/fastapi) (cross-language verified) · [Cloudflare Worker](./adapters/cloudflare-worker) |
| **Aggregator** — search engine for signed feeds                        | [apps/aggregator](./apps/aggregator) · SQLite + FTS5 + REST + UI                                                                         |
| **Corpus observatory** — third-party drift detection                   | [apps/corpus](./apps/corpus) · MCP registry + A2A registry + GitHub READMEs · cross-source divergence as headline                        |
| **Web** — homepage + dashboard + spec + docs                           | [apps/web](./apps/web) · 5 pages from a Claude design handoff                                                                            |
| **IETF draft**                                                         | [docs/IETF-DRAFT.md](./docs/IETF-DRAFT.md) · 2,691 lines · `draft-abdi-agent-feed-00`                                                    |
| **MCP SEP** — `agent-feed` as the streaming layer beneath Server Cards | [docs/MCP-SEP-agent-feed.md](./docs/MCP-SEP-agent-feed.md)                                                                               |
| **78 conformance tests** across 13 files                               | `bun test`                                                                                                                               |

## Two doctrinal commitments

### Snapshot ≠ stream

Every origin gets two artifacts at two URLs:

| URL                            | Mutability        | Answers                                 |
| ------------------------------ | ----------------- | --------------------------------------- |
| `/.well-known/agent-card.json` | mutable, replaced | "what is true _now_"                    |
| `/.well-known/agent-feed.xml`  | append-only       | "how did we get here, and what changed" |

You cannot reconstruct a stream from samples of state. They are different epistemic objects. Mixing them is why migrations break agents silently.

### Signed ≠ observed

Every fact in this system is one of two kinds:

- **Signed** — first-party, `did:web`-rooted, Ed25519-attested. Testimony.
- **Observed** — third-party, sourced, _always_ tagged `UNSIGNED`. Photograph.

The protocol is signed-only. The corpus observatory is observed-only. Storage may join, surfaces never blur. Every observation row carries `source` + `sourceFetchedFrom` + `observedAt`. The dashboard renders unsigned tags loudly, in red, on every observation card. Differently-shaped facts; not a quality gradient.

## How it composes with what you already run

```
agent ↔ agent     MCP · A2A · ANP                how agents talk
agent ↔ api       OpenAPI · agents.json           how agents act
agent ↔ context   llms.txt                        how agents read
agent ↔ change    agent-feed                      how the world announces it moved   ← this project
```

`agent-feed` is _the change-history layer_ beneath those protocols. Bring your own MCP / A2A / ANP / OpenAPI; we announce when they mutate. We are not trying to be the agentic web. The web doesn't live in DNS; we don't either.

## Library quickstart

```ts
import { Reader, withFeedRecovery } from "agent-feed";

const reader = new Reader();
reader.on("mismatch", (e) => console.warn("schema mismatch", e));
reader.on("unverified-entry", (e) => console.warn("bad signature", e));
reader.on("feed-migrated", (e) => console.log("publisher moved", e.migratedTo));

await reader.ingest({ origin, xml, didDocument });

// after every live API call, hand the response to the reader so it can detect drift
reader.observeLiveResponse({ origin, endpointId: "orders-api", body });

// the 404-killer: when an agent gets a 404, consult the feed for a replacement
const fetch2 = withFeedRecovery(reader, fetch, { origin });
const res = await fetch2("https://api.example.com/v1/orders");
```

## CLI quickstart

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

# Verify and lint a remote feed
bun src/cli.ts verify -o https://example.com
bun src/cli.ts lint   -o https://example.com
```

## End-to-end demo (no servers needed)

```bash
bash scripts/full-demo.sh
```

Prints a step-by-step walk: agent calls a v1.0 endpoint successfully → origin migrates to v1.1 and signs a `schema-change` entry → agent re-ingests the feed, reads the migration, and survives the breaking change without redeployment.

## Repository layout

```
agent-feed/
├── SPEC.md                  # the v0 protocol — 1,190 lines, reader contract first
├── ROADMAP.md               # tiered, every item carries its kill-criterion
├── CHANGELOG.md             # shipped items moved here per the roadmap discipline
├── docs/
│   ├── IETF-DRAFT.md        # draft-abdi-agent-feed-00
│   ├── MCP-SEP-agent-feed.md # snapshot ≠ stream proposal
│   └── design-brief.md       # design handoff brief
├── src/                     # reference TypeScript library + CLI
├── tests/                   # 78 tests + conformance vectors
├── adapters/
│   ├── next/                # @agent-feed/next  (44 LOC)
│   ├── fastapi/             # agent-feed-fastapi (Python; cross-language verified)
│   └── cloudflare-worker/   # @agent-feed/cloudflare-worker
├── apps/
│   ├── aggregator/          # signed-feed search engine — SQLite + FTS5
│   ├── corpus/              # observatory — MCP registry + A2A + READMEs
│   └── web/                 # homepage + dashboard + spec + docs (5 pages)
├── examples/                # publisher fixture + consumer-survives-schema-change demo
├── scripts/
│   ├── full-demo.sh         # one-command end-to-end demo
│   └── build-vectors.ts     # regenerate conformance vectors
└── design materials/        # Claude-design handoff: source HTML/CSS for apps/web/
```

## Roadmap

See [ROADMAP.md](./ROADMAP.md) — four tiers, every item has explicit kill-criteria. Shipped items move to [CHANGELOG.md](./CHANGELOG.md) per the roadmap discipline. Highlights:

- **Tier 1** (close the loop): WebSub push, did:web key rotation, HTTP `Cache-Control` honoring.
- **Tier 2** (adoption): hosted conformance checker site, npm/JSR publish.
- **Tier 3** (standards posture): IETF dialogue, MCP TC engagement, A2A extension, Rust + Go ports, formal TLA+ model.
- **Tier 4** (the bets): the 30-year archive, the regulatory wedge, IDE/browser integration, ML training corpus, time-travel debugging — all gated on real-world signal.

## What this is not

- **Not a registry.** No central index. Discovery is by origin URL.
- **Not a discovery protocol.** MCP Server Cards / A2A Agent Cards already cover state-snapshot discovery; agent-feed is the temporal-history layer beneath them.
- **Not a status page.** Operational telemetry has different time-constants and consumers.
- **Not a policy engine.** Pricing, rate limits, ToS belong in a separate slow-changing document.
- **Not the agentic web.** It's a layer, not a runtime. The web doesn't live in DNS; this doesn't either.

## Stewardship

Independent. MIT-licensed. The two architecture roundtables that produced the trust-plane separation (`pg`+`carmack`+`taleb`+`hickey` for the protocol; `hickey`+`carmack`+`taleb`+`karpathy` for the corpus) are committed to this repo as design provenance. No company. No funding. No signup. `agent-feed.dev`, not `app.agent-feed.dev`.

## License

[MIT](./LICENSE).
