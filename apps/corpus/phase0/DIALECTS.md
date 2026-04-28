# Phase 0 — schema dialects observed

**Date:** 2026-04-28
**Purpose:** Karpathy's gate. Stare at real rows from real sources before designing the normalized corpus schema. Karpathy: _"if you can't articulate three distinct schema dialects, the dataset isn't a dataset yet."_

**Sources actually fetched:**

| Source                                        | Records                     | Bytes  | Dialect                       |
| --------------------------------------------- | --------------------------- | ------ | ----------------------------- |
| `registry.modelcontextprotocol.io/v0/servers` | 500 servers (5 pages × 100) | ~      | **MCP Registry**              |
| `a2aregistry.org/api/agents`                  | many                        | 172 KB | **A2A Agent Card**            |
| `punkpeye/awesome-mcp-servers` README         | many                        | 690 KB | **README list**               |
| `modelcontextprotocol/servers` README         | (official)                  | 24 KB  | **README list (sparse)**      |
| `prassanna-ravishankar/a2a-registry` README   | catalog                     | 6 KB   | **README list (frontmatter)** |

Three distinct dialects directly. README is two variants of one shape, but MCP Registry and A2A Agent Card are profoundly different even though both describe "an agent endpoint."

---

## Dialect 1 — MCP Registry (structured JSON)

```json
{
  "$schema": "https://static.modelcontextprotocol.io/schemas/2025-12-11/server.schema.json",
  "name": "ai.agenttrust/mcp-server",
  "description": "Identity, trust, and A2A orchestration for autonomous AI agents.",
  "title": "AgentTrust — Identity & Trust for A2A Agents",
  "repository": {
    "url": "https://github.com/agenttrust/mcp-server",
    "source": "github"
  },
  "version": "1.1.1",
  "websiteUrl": "https://agenttrust.ai",
  "icons": [{ "src": "https://agenttrust.ai/icon.png", "sizes": ["96x96"] }],
  "packages": [
    {
      "registryType": "npm",
      "identifier": "@agenttrust/mcp-server",
      "version": "1.1.1",
      "transport": { "type": "stdio" },
      "environmentVariables": [
        {
          "description": "...",
          "isRequired": true,
          "isSecret": true,
          "name": "AGENTTRUST_API_KEY"
        }
      ]
    }
  ]
}
```

**Identity convention:** reverse-DNS-style `name` (`ai.agenttrust/mcp-server`, `ac.inference.sh/mcp`).
**Endpoint shape:** array of `remotes[]` (HTTP transports) AND/OR `packages[]` (stdio + npm/pip distribution). One server can have multiple endpoints across multiple transports.
**Versioning:** semver `version` per server.
**Trust hint:** `_meta.io.modelcontextprotocol.registry/official` carries `status`, `publishedAt`, `updatedAt`. Registry is the trust authority.
**Agent capabilities:** _implicit_, derived from package transport and env variables. No declared capabilities object.
**`$schema` URL pinned:** every record references the dated schema doc.

## Dialect 2 — A2A Agent Card (structured JSON, very different)

```json
{
  "protocolVersion": "0.3.0",
  "name": "The Hotel Salem – Reservations",
  "description": "Manage booking inquiries...",
  "author": "inHotel",
  "wellKnownURI": "https://87fd...inhotel.io/.well-known/agent-card.json",
  "url": "https://87fd...inhotel.io/",
  "version": "1.0.0",
  "provider": { "organization": "inHotel", "url": "https://www.inhotel.io/" },
  "documentationUrl": "https://...",
  "iconUrl": null,
  "supportsAuthenticatedExtendedCard": null,
  "security": [],
  "securitySchemes": {},
  "capabilities": {
    "streaming": true,
    "pushNotifications": false,
    "stateTransitionHistory": true,
    "extensions": [
      {
        "uri": "https://.../inhotel-metadata",
        "params": {
          "bio": "...",
          "role": "Reservations",
          "location": { "address": "..." }
        }
      }
    ]
  }
}
```

**Identity convention:** `wellKnownURI` is canonical — a URL pointing to `/.well-known/agent-card.json`. Identity is _the location of the card_, not a name string.
**Endpoint shape:** single `url`.
**Versioning:** dual — `protocolVersion` (what A2A version the agent speaks) AND `version` (the agent itself).
**Trust hint:** `securitySchemes` is first-class (and often empty in practice). Provider/author are declared but unsigned.
**Agent capabilities:** **first-class object** with `streaming`, `pushNotifications`, `stateTransitionHistory`, `extensions[]`. A2A treats capabilities as structured contract; MCP treats them as inferred-from-package.
**Extensions are namespaced:** `uri` + `params` pattern — open-ended, vendor-extensible.

## Dialect 3 — README list (markdown)

```
- **1mcp/agent** - "A unified Model Context Protocol server implementation that aggregates multiple MCP servers into one."
- **espadaw/Agent47** - "Unified job aggregator for AI agents across 9+ platforms (x402, RentAHuman, Virtuals, etc)."
```

**Identity convention:** GitHub `owner/repo` extracted from a markdown link. No URI scheme; no canonical resolution to anything machine-readable.
**Endpoint shape:** absent. README has prose; you have to follow the link to GitHub, then maybe to a `/.well-known/` to find an actual endpoint.
**Versioning:** absent.
**Capabilities:** absent — buried in human-readable description prose.
**Categorization:** organized by H2 headings (TypeScript / Python / Cloud / Search / Files / Databases). The category IS metadata, but it lives in the document structure, not in any record.

The two README variants we fetched (`punkpeye` and `modelcontextprotocol/servers`) differ in their bullet conventions (badges, link styles, headers) but share the underlying "name + description + link" shape.

---

## What this tells us about the normalized schema

### Concepts that exist in 2+ dialects (must be in our normalized shape)

| Concept             | MCP                                      | A2A                              | README                  |
| ------------------- | ---------------------------------------- | -------------------------------- | ----------------------- |
| **Display name**    | `title`                                  | `name`                           | derived from link       |
| **Identifier**      | `name` (reverse-DNS)                     | `wellKnownURI` (URL)             | `owner/repo` (GitHub)   |
| **Description**     | `description`                            | `description`                    | freeform markdown       |
| **Endpoint URL(s)** | `remotes[].url` + `packages[].transport` | `url`                            | none, must dereference  |
| **Version**         | `version`                                | `version` + `protocolVersion`    | absent                  |
| **Provider/author** | `repository.url`                         | `provider.organization`          | implicit (GitHub owner) |
| **Trust marker**    | `_meta...status`                         | `securitySchemes`                | none                    |
| **Capabilities**    | implicit (packages)                      | explicit (`capabilities` object) | none                    |

### Concepts that exist in only one dialect (our schema must NOT force these on others)

- **`packages[]`** (transport + env vars) — MCP only. Not a fit for A2A, not in READMEs.
- **`capabilities` first-class object** — A2A only. MCP infers; README ignores.
- **Category by H2 heading** — README only. Lost to JSON sources.
- **`protocolVersion`** — A2A only. MCP has no concept of an outer protocol version.

### Identity unification problem

The single hardest normalization decision: **what is the canonical `origin` for an observation?**

Three answers in three sources:

- MCP: `name` is reverse-DNS-ish but not a URL. To get an origin URL we need `repository.url`, `websiteUrl`, or one of the `remotes[].url` hosts.
- A2A: `wellKnownURI` IS a URL. Take its origin.
- README: `owner/repo` → GitHub URL → maybe a homepage in the README's repo, maybe not.

**Decision (deferred to Phase 1 design):** the corpus stores origin as a _best-effort_-resolved URL with a `originResolution` field describing how it was derived (`a2a-card-uri`, `mcp-website-url`, `mcp-remote-host`, `github-repo-url`, `unknown`). Cross-source merging happens on this resolved origin; when it's `unknown`, the record is its own bucket.

### Cross-source disagreement is real, observable, and the highest-signal artifact

The `agenttrust` server appears in our MCP registry sample with `name: ai.agenttrust/mcp-server`, `version: 1.1.1`. If it also appears in awesome-mcp-servers with a different version pinned, or in the A2A registry with `protocolVersion: 0.2.0` while its MCP entry was last updated in February — those divergences are **the dataset**, not noise. Karpathy was right.

### Schema sketch (informs Phase 1, not committing yet)

```ts
type Observation = {
  // identity
  origin: string; // best-effort canonical URL
  originResolution:
    | "a2a-card-uri"
    | "mcp-website"
    | "mcp-remote-host"
    | "github-repo"
    | "unknown";
  observedAt: string; // RFC 3339, when WE fetched it
  source: "mcp-registry" | "a2a-registry" | "github-readme" | "well-known";
  sourceRecordId: string; // source's stable id for this row
  sourceFetchedFrom: string; // exact URL we hit

  // common normalized facts (all optional — many sources don't carry these)
  name?: string;
  description?: string;
  version?: string;
  protocolVersion?: string;
  endpoints?: { url: string; transport?: string }[];
  capabilities?: Record<string, unknown>; // pass-through, dialect-shaped
  provider?: { name?: string; url?: string };

  // raw passthrough — for retraining, debugging, schema-evolution research
  raw: unknown; // the original record, byte-shaped
};
```

The `raw` field is non-negotiable: dialect-specific richness must be preserved for training and forensic replay (Karpathy's "noise IS the training signal" insight).

---

## Decisions confirmed by the stare

1. **Identity column is per-source-resolved best-effort, not enforced canonical.** Forcing all three dialects into one identity scheme would lose information.
2. **`raw` field is mandatory.** Lossy normalization destroys the dataset's training value. Save the original bytes.
3. **`originResolution` is needed** so cross-source joins are honest about how confident the merge is.
4. **A2A's `wellKnownURI` IS our protocol's bridge.** Every A2A agent card is hosted at a `/.well-known/` URL; if we can fetch it directly we can present a _signed_ version (if the publisher signs) alongside the _observed_ registry-listed version. This is the conversion event Hickey predicted: publisher sees their own divergence between A2A registry and live well-known.
5. **MCP Registry is the lowest-friction first ingest.** Structured, paginated, RFC 3339 cursor support, zero parsing ambiguity. 500 records on the first call. Start here.

## Decisions still open after Phase 0

- **README parser shape.** Markdown-bullet extraction is regex/heuristic territory; per-repo grammars vary. Pick one repo first (probably `modelcontextprotocol/servers` — official, smaller, more disciplined), build adapter, generalize later only if it earns its keep.
- **A2A capability extension namespacing.** `extensions[].uri` is open-ended (`inhotel-metadata` etc.). Do we ingest these as opaque blobs, or attempt cross-vendor unification? Phase 1 default: opaque. If divergence detection on extension contents becomes valuable, revisit.
- **Update cadence.** MCP registry exposes `updated_since`; daily polling is sufficient. A2A registry shape may or may not — need to check. README crawl: weekly is plenty.
