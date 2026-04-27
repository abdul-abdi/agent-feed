# MCP SEP: agent-feed as the streaming history layer beneath Server Cards

**SEP:** TBD (proposed)
**Title:** agent-feed: a signed event stream for MCP server change history
**Author:** Abdullahi Abdi <abdullahiabdi1233@gmail.com>
**Status:** Proposal
**Type:** Standards
**Date:** 2026-04-27
**Targets:** MCP 2026.x

---

## Abstract

Add a complementary stream artifact at `/.well-known/agent-feed.xml` to the upcoming Server Cards snapshot at `/.well-known/mcp-servers.json`. Server Cards describe **what is true now**; agent-feed describes **what became true and when**. Together they give MCP clients both current state and the audit trail required to detect, attribute, and respond to server-side change.

The stream is protocol-neutral, signed via `did:web` + Ed25519, and adds zero new cryptography. It composes with Server Cards rather than competing with them.

## Motivation

Server Cards (planned for MCP 2026 Q2 per `modelcontextprotocol#1960`, `#1147`, `#69`) describe an MCP server's current capabilities at a well-known URL. This is necessary but not sufficient. Three failure modes Server Cards cannot solve on their own:

1. **Schema drift breaks clients silently.** When a server modifies a tool's parameter schema, dependent clients fail without warning. A snapshot of the _new_ schema does not tell a client _what changed_ or _when_ — it only tells them the present, not the path to the present.

2. **Endpoint moves are recoverable but not communicated.** When an MCP server moves to a new origin or path, clients see 404. Server Cards at the old URL go stale; clients have no way to learn the move beyond reading status pages or release notes.

3. **No forensic substrate for agent-time disputes.** When an agent acts on behalf of a user — purchase, contract, multi-step transaction — and that action depends on a server's schema at a moment in time, the agent's operator needs to be able to reconstruct _what the server claimed_ at that moment. A point-in-time snapshot, replayed from a Server Card, cannot provide this; the card mutates.

These are not registry problems; they are _temporal_ problems. Snapshots and streams are different artifacts. You cannot reconstruct history by sampling state.

## Specification

### Two artifacts, two URLs

| URL                                                                           | Format                                    | Mutability                                                   | What it answers                                 |
| ----------------------------------------------------------------------------- | ----------------------------------------- | ------------------------------------------------------------ | ----------------------------------------------- |
| `/.well-known/mcp-servers.json` (Server Cards, this proposal does not modify) | JSON                                      | mutable                                                      | "What MCP servers and tools are available now?" |
| `/.well-known/agent-feed.xml` (this proposal)                                 | Atom 1.0 + `https://agent-feed.dev/ns/v0` | append-only at the (entry-id, canonical-payload) tuple level | "What changed, when, and how?"                  |

These artifacts are deliberately separate. A reader of one need not consume the other; an implementation that supports both gets state-plus-history at the cost of two HTTP GETs.

### Three entry types

Per the agent-feed v0 specification (`SPEC.md` in this repository), three entry types are defined:

- `endpoint-announcement` — "for this origin, the canonical URL serving this protocol is X, currently at schema version V."
- `schema-change` — "endpoint X moved from schema version A to B at this moment; here is the structural delta."
- `deprecation` — "endpoint X will be removed on date D; use Y instead, if Y is given."

Each entry carries a JSON payload, signed via detached Ed25519 over the canonicalized payload. The signing key is published via `did:web` at `/.well-known/did.json`.

### Reader contract

A conformant MCP client that subscribes to an origin's agent-feed:

- MUST verify each entry's signature against the origin's `did.json` before applying.
- MUST treat entries idempotently: the same entry id with identical canonical payload, re-fetched, is not re-applied.
- MUST emit an event when an entry id is reused with a _different_ payload (`replay-mismatch`).
- MUST NOT silently coerce live API responses to match feed-announced schemas; instead emit `mismatch` with explicit fallback version (i.e., the most recent version the reader has reason to believe the world supports).
- MUST honor `feed-status: terminated` (drop trust) and SHOULD follow `feed-status: migrated` to a new feed URL.

The full reader behavioral contract is normative in the agent-feed v0 specification §2.

### Why this fits MCP cleanly

1. **`.well-known/` co-location.** Server Cards already live at `/.well-known/mcp-servers.json`; agent-feed at `/.well-known/agent-feed.xml` is the same hosting pattern (RFC 8615).
2. **Identity already implied.** Server Cards do not formalize identity beyond TLS; agent-feed adds detached Ed25519 over a `did:web` document, which any Server Card publisher can adopt without changing how they serve cards.
3. **No new transport.** Atom over HTTPS. CDNs, conditional GETs, and HTTP caching all apply unchanged.
4. **No protocol coupling.** agent-feed announces facts about MCP endpoints; it does not depend on or modify the MCP wire protocol. An MCP client that ignores agent-feed loses no MCP functionality.

### What this proposal does NOT do

- Does not modify the Server Cards schema.
- Does not add a streaming requirement to MCP itself.
- Does not introduce a new identity system; uses W3C DID + Ed25519, both standardized.
- Does not specify push transport in v0; polling is sufficient. WebSub is a future v0.1 extension.
- Does not specify capability advertisement, tool discovery, or status — those are Server Cards' job (or out of scope entirely).

## Rationale

### Why a separate URL, not an extension to Server Cards?

The mutability profile is fundamentally different. Server Cards mutate when reality mutates: a tool is added, a tool is removed, the card changes. agent-feed _accretes_ — every change is a new entry, never a modification of an old one. Braiding state and history into one document forces compromises on both: either the snapshot becomes a fat object holding its own history, or the history is implicit in card-version-N-vs-card-version-N-1 diffs that the publisher must compute and the client must reconstruct.

Hickey's principle of decomplecting applies: snapshot and stream are two ideas. Make them two artifacts.

### Why Atom and not JSON?

1. Atom is RFC 4287 with 20 years of tooling, content-encoding, syndication infrastructure. CDNs, feed validators, conditional-GET libraries all work unchanged.
2. The `<entry>` envelope cleanly separates per-entry signature from envelope metadata.
3. Future-compatibility with WebSub (RFC also using Atom) is a "no work" change rather than a redesign.

JSON Feed is a viable alternative. Atom won on the prior-art surface; if MCP TC prefers JSON Feed, the spec is mechanically translatable.

### Why `did:web`?

- Ties identity to domain ownership the publisher already controls.
- Resolves through HTTPS — no new infrastructure.
- Admits future migration to other DID methods without changing the entry envelope.

### Why detached Ed25519, not a JWS?

- The signed bytes are the _canonical JSON payload_, not the Atom envelope. JWS embeds the signature into a JSON wrapper that would conflict with Atom's `<content>` element.
- Detached signatures keep the `<content>` element verbatim — useful for tooling that already parses canonical JSON.
- Ed25519 over canonical JSON has cross-language reproducibility (the agent-feed reference implementation includes both TypeScript and Python implementations that produce byte-identical canonical forms).

## Backwards Compatibility

None to worry about. agent-feed is an additive artifact at a new well-known path. Servers that do not publish a feed are not non-compliant; clients that do not consume one lose only the _change-history_ dimension that does not exist today.

If a Server Card publisher later adopts agent-feed:

- Existing Server Card consumers continue working.
- New agent-feed consumers gain the temporal layer.
- The two artifacts may produce inconsistent claims; the reader contract MUSTs that inconsistency be treated as a publisher bug to be reported, not silently coerced (see SPEC §2.8 and §4.3).

## Reference Implementation

A complete reference implementation lives at this repository:

- TypeScript reader, signer, CLI, and aggregator: `src/`, `apps/aggregator/`
- Python adapter (FastAPI): `adapters/fastapi/`
- Next.js adapter: `adapters/next/`
- Cloudflare Worker adapter: `adapters/cloudflare-worker/`
- Conformance test vectors: `tests/vectors/`
- Working end-to-end demo: a fixture origin announces a `schema-change`; an agent ingests, applies the migration delta, and survives the breaking change without re-deployment.

The TypeScript reference is ~850 source LOC; the Python adapter is ~210; the Next.js adapter is 44.

## Security Considerations

Detailed in SPEC §3 and §9. Summary:

- Signature proves origin, not truth. A publisher can sign a _false_ schema-change. Detection is reputation-layer, not protocol-layer; out of scope for v0.
- Sybil resistance is not provided; relying parties must source-of-truth at the domain level.
- Replay is mitigated by entry-id idempotency.
- Privacy: agent-feed entries are PUBLIC; private/internal MCP servers should not publish.
- Polling load on origins: readers SHOULD poll at most once per 60 seconds and at least once per 24 hours.
- Key rotation: deferred to v0.1 (the rotation procedure is sketched in SPEC §3.5; not exercised in v0 reference).

## Open Questions

1. Should MCP TC formalize an alignment requirement between Server Cards and agent-feed (i.e., the snapshot MUST be derivable from the most recent applicable feed entries)? The agent-feed SPEC takes this position; MCP can either adopt or relax it.
2. Should MCP TC bless `did:web` as the recommended identity binding for Server Card publishers, even outside agent-feed? It would solve a separate Server Card identity gap.
3. WebSub push: should MCP clients be required to support both poll and push, or should push remain a publisher-side opt-in? The agent-feed v0 SPEC defers this to v0.1.

## Adoption Path

1. **Community review** of this SEP and the agent-feed v0 spec.
2. **Reference implementation soak**: at least one externally-operated MCP server publishes an agent-feed; at least one client (Claude Desktop, Cursor, an open-source CLI) reads it experimentally.
3. **MCP 2026 Q3 inclusion**: agent-feed cited as the recommended history-layer companion to Server Cards. Both `.well-known/` paths SHOULD be served together.
4. **MCP 2027 normative**: SHOULD becomes MUST for Server Card publishers above some scale threshold (TBD by TC).

## Acknowledgements

The roundtable that produced the agent-feed v0 design (`pg`, `carmack`, `taleb`, `hickey`) is the source of the protocol's shape — particularly the snapshot-vs-stream distinction (Hickey), the kill-switch and version field requirement (Carmack, Taleb), and the publish-first bootstrapping path (PG).

## References

- [SPEC.md](../SPEC.md) — agent-feed v0 specification
- [docs/IETF-DRAFT.md](./IETF-DRAFT.md) — draft-abdi-agent-feed-00 (companion track)
- [ROADMAP.md](../ROADMAP.md) — multi-tier roadmap including this SEP as Tier 3 #14
- modelcontextprotocol [#1960](https://github.com/modelcontextprotocol/modelcontextprotocol/issues/1960), [#1147](https://github.com/modelcontextprotocol/modelcontextprotocol/discussions/1147), [#69](https://github.com/modelcontextprotocol/modelcontextprotocol/discussions/69) — the gap this SEP addresses
- W3C DID 1.0; W3C `did:web`; RFC 4287 (Atom); RFC 8032 (Ed25519); RFC 8615 (`.well-known/`); RFC 2119 (MUST/SHOULD/MAY)
