# Security

## What this project does and does not protect against

agent-feed is a _signed origin announcement_ protocol. The Ed25519 signature on each entry proves **the origin asserted this** at the time of signing. It does NOT prove:

- That the assertion is _true_ (a malicious publisher can sign a false `schema-change`)
- That the publisher controls the underlying API endpoint (only that they control the `did:web` keypair)
- That the announcement reflects current state — that's what `agent-card.json` is for

These are deliberate scope boundaries documented in [SPEC.md §1.4 What's out of scope](./SPEC.md). The protocol is layered alongside (not above) authentication mechanisms like OAuth, mTLS, and capability tokens.

## Reporting a vulnerability

If you find a security issue in the reference implementation:

- Email **abdullahiabdi1233@gmail.com** with `[security] agent-feed` in the subject
- Or open a GitHub Security Advisory at https://github.com/abdul-abdi/agent-feed/security/advisories/new

Please give us 30 days to acknowledge before any public disclosure. We'll credit you in the fix release notes if you'd like.

## Threat-model surface to keep in mind when reviewing PRs

- **Signature verification path** — `src/crypto.ts`, `src/feed.ts:parseFeed`. A bug here is a critical (UNSIGNED entries leaking into signed-feed consumers).
- **Cross-source mixing** — the corpus and aggregator share storage but must not share output paths. Anywhere you see a query joining `entries` (signed) with `observations` (unsigned), there must be an explicit reconciliation step that preserves provenance.
- **Crawl scope** — the corpus respects `robots.txt`, fetches only schemas (`/.well-known/*` files and registry APIs), and supports `/api/corpus/optout`. It does NOT fetch HTML pages or full-text bodies. Any change that broadens this needs an issue + discussion first.
- **`did:web` resolution** — TLS validation is delegated to the platform. We do not pin certificates. Compromise of the publisher's TLS chain compromises the keypair distribution.

## Known limitations (v0)

- No key rotation flow (Tier 1 #3 in [ROADMAP](./ROADMAP.md))
- No replay-attack protection beyond per-entry timestamps and the publisher's append-only contract
- The aggregator's full-text search index is unauthenticated; treat the public corpus as you would any public dataset
