---
spec: agent-feed
version: 0
date: 2026-04-27
status: Draft
namespace: https://agent-feed.dev/ns/v0
---

# agent-feed v0

A signed, append-only, web-native announcement plane for sites to tell agents
that something has changed.

This document specifies the protocol. It is implementation-neutral.

The keywords MUST, MUST NOT, REQUIRED, SHALL, SHALL NOT, SHOULD, SHOULD NOT,
RECOMMENDED, MAY, and OPTIONAL are to be interpreted as described in
RFC 2119, when, and only when, they appear in all capitals.

---

## §1 Overview

### 1.1 What this protocol is

The web has two kinds of artifacts at well-known locations: artifacts that describe **what is true now** (`robots.txt`, `sitemap.xml`, `openapi.json`) and artifacts that describe **what became true and when** (Atom feeds, changelogs, audit logs). The first kind are _snapshots_. The second kind are _streams_.

agent-feed is a stream. It carries an ordered, signed, append-only sequence of small facts an origin asserts about its own machine-readable surface: which endpoint is canonical for a given protocol; that a particular endpoint's schema has changed; that a particular endpoint is deprecated. It is published at `/.well-known/agent-feed.xml`. It is identified and authenticated by a `did:web` document at `/.well-known/did.json`. It is signed with detached Ed25519 over a canonicalized JSON payload per entry.

The protocol exists so that agents — long-running, partially autonomous software acting on behalf of a principal — do not break silently when the world changes underneath them. An agent obeying this protocol can detect a schema change at the moment the origin announced it, distinguish that announcement from network noise or accidental drift, and fall back deterministically when the live world does not match the announced world.

### 1.2 What this protocol is not

This protocol does **not**:

- describe the **state** of an origin's agent surface; that belongs in a snapshot artifact at a different URL (see §4);
- carry **operational telemetry** (incidents, outages, latency); status pages exist for this and have different time-constants and consumers;
- carry **policy contracts** (pricing, rate limits, ToS for agent traffic); policy is slow-changing and legal-shaped and does not belong in an event stream;
- define a **transport** for agent-to-agent or agent-to-tool communication; MCP, A2A, and HTTP exist for this and agent-feed is neutral with respect to them;
- define a **registry** or any centralized directory; every origin publishes for itself;
- define **discovery** of origins; a reader is presumed to already know which origins it cares about;
- define a **push transport**; readers poll. WebSub is reserved for a future extension (see §9);
- define a **trust model** beyond "this origin signed this fact"; a signature binds a fact to a key resolved from the origin's DNS, and that is all. The protocol does not assert that the fact is _true_ (see §9 on lying-publisher).

### 1.3 What problem this solves, in one sentence

When an origin's machine-readable surface changes, the origin gets a permissionless, web-native, signed way to say so, once, and any agent that cares can read that fact later, verify it came from the origin, and act on it.

### 1.4 What this protocol decomposes into

Five things, kept separate on purpose:

1. **Identity** — a `did:web` document binds an Ed25519 public key to an origin (§3).
2. **Snapshot artifact** — current state, at a separate URL (§4).
3. **Stream artifact** — append-only signed history, at `/.well-known/agent-feed.xml` (§4, §5).
4. **Reader behavioral contract** — what a conformant agent does on receipt of each entry type, including disagreement with the live world (§2).
5. **Versioning and kill switch** — the protocol assumes its own evolution and revocation (§7).

These five concerns are not braided. A change to one does not require a change to the others.

### 1.5 Where this fits

The emerging ecosystem of agent protocols (MCP, A2A, ANP, ERC-8004) and capability snapshots (MCP Server Cards, A2A Agent Cards, OpenAPI) all describe **what an origin's agent surface is**. None describe **when and how that surface changed**. agent-feed is the temporal layer beneath the snapshot layer. It assumes a snapshot exists; it does not replace it.

You cannot reconstruct history by sampling state. That sentence is the foundation of §4.

---

## §2 Reader's behavioral contract

This is the load-bearing section. The producer schema in §5 is derivative — it is whatever shape lets a conformant reader behave as specified here.

A reader is any program that consumes agent-feed entries on behalf of an agent. The agent is the principal; the reader does the parsing, signature verification, state-tracking, and event-emission on the agent's behalf. The reader is the contract surface.

### 2.1 Reader state

A conformant reader MUST maintain the following per-origin state:

- **Trust flag.** Boolean. Initially `true` for any origin the reader has ingested. Becomes `false` when the origin's most recent feed declares `feed-status: terminated` (§7). Once `false`, all of that origin's entries — past and future — MUST cease to influence agent behavior until a human operator explicitly re-trusts the origin out of band. A `feed-status: migrated` value MUST be treated as `terminated` for trust at this URL, with the additional behavior in §7.3.
- **Endpoint table.** A mapping from `(protocol, endpoint-id) → endpoint-record`, where an endpoint-record carries the URL, the current schema version, the migration history into that version, and any pending deprecation.
- **Last-seen identifier.** The `id` of the last entry applied for this origin, used for idempotency.

A reader MAY maintain richer state; MUST NOT maintain less.

### 2.2 On receipt of a feed document

Before applying any entry, the reader MUST:

1. Resolve the origin's DID document at `/.well-known/did.json` over HTTPS (§3). If resolution fails, the reader MUST NOT apply any entry. The previous trust state is unchanged. The reader SHOULD surface a `did-unreachable` event.
2. Extract the verification key per §3.4.
3. Parse the feed XML per §6.
4. Read the feed-level `af:feed-status` (§7).
5. For each `<entry>`, in document order, perform §2.3 (verify) before §2.4 (apply).

Document order matters. A reader MUST apply entries in the order they appear, not by `updated` timestamp; the publisher's stated order is the source of truth for this feed document. Timestamps are for forensic display, not ordering.

### 2.3 Per-entry verification

For each entry, the reader MUST:

1. Extract the canonical payload bytes from `<content>` (§6).
2. Extract the signature bytes from `<af:sig>` (§6).
3. Verify the signature against the canonical payload bytes using the public key from §3.
4. If verification fails, mark the entry **unverified** and proceed to §2.5.
5. If verification succeeds, mark the entry **verified** and proceed to §2.4.

A reader MUST NOT apply an unverified entry. There is no partial credit. An entry whose signature does not verify is, for purposes of this protocol, not an entry — it is bytes.

### 2.4 Apply by entry type (verified entries)

#### `endpoint-announcement`

Publisher asserts: "for this origin, the canonical URL serving this protocol is X, currently at schema version V."

```
upsert origin.endpoints[(payload.protocol, payload.endpoint-id)] = {
  url:      payload.endpoint,
  version:  payload.version,
  protocol: payload.protocol,
  migrations: keep-existing-or-empty,
  deprecated: keep-existing-or-clear-if-replacement-now-known,
}
```

If a prior announcement existed for the same `(protocol, endpoint-id)` with a different URL, the new one wins. The reader MUST NOT keep parallel records of "old URL" and "new URL" — that is the deprecation entry's job.

#### `schema-change`

Publisher asserts: "endpoint X moved from schema version A to B at this moment; here is the structural delta."

```
let ep = origin.endpoints[(_, payload.endpoint-id)]
if ep is undefined:
  synthesize record with version = payload.from-version
ep.migrations[payload.from-version + "->" + payload.to-version]
  = payload.migration
ep.version = payload.to-version
```

The agent uses the retained migration delta to decode responses in the new shape or translate its own emitted requests.

#### `deprecation`

Publisher asserts: "endpoint X will be removed on date D. Use Y instead, if Y is known."

```
let ep = origin.endpoints[(_, payload.endpoint-id)]
if ep is undefined:
  emit "deprecation-of-unknown"; ignore
ep.deprecated = { sunset: payload.sunset, replacement: payload.replacement }
```

Until sunset, the reader returns the original URL when asked; on or after sunset, the reader returns the replacement URL if known, and emits `deprecated-and-sunset`. If sunset has passed and no replacement is known, the reader returns no URL — the endpoint is dead. The agent decides what dead means in its own context.

### 2.5 On unverified entries

When an entry's signature does not verify, the reader MUST:

- not apply it,
- emit an `unverified-entry` event identifying the entry id and the feed URL,
- continue processing subsequent entries.

One bad signature is not authority to revoke the publisher; only `feed-status: terminated` does that (§7). A reader SHOULD rate-limit the `unverified-entry` event.

### 2.6 On unknown entry types

If `af:type` is not one of the three defined in §5, the reader MUST:

- skip the entry without applying it,
- NOT treat it as unverified — the signature may be valid; the reader simply does not understand the type,
- emit an `unknown-entry-type` event identifying the type string,
- continue processing subsequent entries.

A v0 reader does not invent semantics for unknown types. It logs and moves on.

### 2.7 On feed-status

`active` — proceed normally.

`terminated` — the publisher is revoking trust in this feed. The reader MUST set the per-origin trust flag to `false`. Past entries cease to influence future queries. The reader MUST NOT silently "undo" applied state, but MUST NOT use it for future queries either. A higher-level agent may fall back to last-known-good state with warnings; the reader does not make that decision.

`migrated` — see §7.3. The reader MUST treat this as `terminated` for the present URL and SHOULD follow `af:migrated-to` to a new feed URL, where verification and ingestion start fresh.

### 2.8 Disagreement with the live world

The case this section exists to handle. Two shapes.

#### 2.8.1 The live API returns a schema the feed predicted

Recorded state: `/api/orders` at version 1.1, migrated from 1.0 by adding `currency`. The agent calls `/api/orders`; the response has `currency`. The agent passes the response and endpoint URL to the reader's `observe-live-response` operation.

```
let ep = origin.endpoints[endpoint-id]
let prior-version, migration = most-recent-migration-into(ep.version)
if migration is None: return
match migration.add against fields-present-in-response:
  if all expected-added fields present: ok, no event
  if any missing: emit "mismatch"
match migration.remove:
  if any removed field still present: emit "mismatch"
match migration.rename:
  if old name still present: emit "mismatch"
```

In the matching case, no event fires. The reader has confirmed the feed's prediction against the world.

#### 2.8.2 The live API returns a schema the feed did NOT predict

Recorded state: `/api/orders` at version 1.1, migrated from 1.0 by adding `currency`. The response has `total` but no `currency`; or a new field `tax_rate` that no feed entry mentioned.

```
emit "mismatch" event {
  origin, endpoint,
  expected-version: ep.version,
  observed-discrepancy: {
    expected-but-missing: [...],
    observed-but-unannounced: [...],
  },
  fallback-version: most-recent-known-good-prior-version,
}
```

The reader MUST NOT silently coerce the response into the announced shape. MUST NOT auto-rollback its recorded version. MUST NOT re-fetch the feed in response — that would conflate "the world is wrong" with "the world updated and I missed it."

The reader reports the disagreement with a _fallback version_ — the last version the reader has reason to believe the world supports. The agent decides whether to retry against the fallback, fail the operation, escalate to a human, or trust the live response over the feed. The reader reports facts; agent policy decides what to do.

#### 2.8.3 The live API is unreachable

Not a feed-vs-world disagreement; a network event. The reader does nothing. The agent handles it as any other transport failure.

### 2.9 Re-ingestion idempotency

- An entry whose `id` matches an already-applied entry's `id` MUST be skipped silently. No re-application. No event.
- A reader MAY use HTTP conditional-GET (`If-None-Match`, `If-Modified-Since`); idempotency is required at the entry-id level regardless of HTTP caching.
- If a publisher rewrites a feed such that an `id` is reused with different canonical payload, the reader MUST emit `replay-mismatch` and MUST NOT apply the new content. Reusing an `id` violates the append-only contract (§4.4).

### 2.10 Polling cadence

A reader SHOULD poll each origin at most once per 60 seconds and at least once per 24 hours. The lower bound prevents DoS against publishers; the upper bound prevents feed death by neglect.

A reader SHOULD honor `Cache-Control` and `ETag` within those bounds. A publisher returning `max-age=600` is asking for ten-minute granularity; a reader SHOULD comply. A reader MAY support a future push extension (§9.5) but it is not v0.

### 2.11 What the reader does NOT do

A conformant reader does not, in v0:

- decide whether the publisher is "trustworthy" beyond signature verification (§9.3);
- maintain per-publisher reputation scores;
- aggregate state across origins;
- emit telemetry to any third party;
- modify outgoing requests to match the recorded schema; the agent does that, using the migration data the reader records;
- delete past state; even after `terminated`, the historical record is preserved for audit, just not consulted.

A reader that does any of those things is doing something on top of v0, not part of it.

---

## §3 Identity

### 3.1 The minimum viable identity claim

The protocol asserts exactly this: "the bytes you are reading were signed by the holder of the Ed25519 private key whose public counterpart is published at `/.well-known/did.json` under the DID `did:web:<origin>`."

That is all §3 specifies. It does not say the holder is honest, is the same party as last year, or is bound to any legal entity. It binds bytes to a key, and a key to a hostname.

### 3.2 DID method

The DID method is `did:web` per the W3C `did:web` Method Specification, within the W3C Decentralized Identifiers (DIDs) v1.0 framework. We rely on its rule that `did:web:<host>` resolves to `https://<host>/.well-known/did.json` (with standard percent-encoding for non-default ports), fetched over HTTPS.

A v0 publisher MUST publish a `did:web` document at `/.well-known/did.json`. This is part of identity, not part of the feed.

### 3.3 Required fields in the DID document

A v0 DID document MUST contain:

- `id`: the DID, of the form `did:web:<host>` (or with port).
- `verificationMethod`: an array with at least one entry.

The verification method whose `id` matches the feed's declared signer (§6.4), or the first entry if no signer is declared, MUST have:

- `type`: `Ed25519VerificationKey2020`.
- `controller`: the DID itself.
- `publicKeyMultibase`: a multibase-encoded raw 32-byte Ed25519 public key.

Additional verification methods MAY be present; v0 readers MAY ignore them.

### 3.4 Key resolution by readers

A v0 reader, given an origin URL, MUST:

1. Fetch `<origin>/.well-known/did.json` over HTTPS (RFC 8615).
2. Confirm `id` matches `did:web:<host>` for the queried host.
3. Locate the verification method whose `id` matches the feed's declared signer (§6.4); if none declared, use the first `Ed25519VerificationKey2020`.
4. Decode `publicKeyMultibase` per the multibase prefix.
5. Confirm the decoded key is exactly 32 bytes.

If any step fails, the reader treats the origin as having no resolvable key, MUST NOT apply any entry, and SHOULD emit `did-unreachable` or `did-malformed`.

### 3.5 Key rotation

A publisher rotates a key by publishing a new `verificationMethod` in `did.json`. v0 specifies no rotation ceremony; the publisher is responsible for continuity (leaving the old key valid for a transition window, or re-signing the feed under the new key).

The feed declares which key signed each entry by reference to a verification method id (§6.4). A feed MAY be partially signed by an old key and partially by a new key; a reader MUST verify each entry under the key it claims.

A reader MUST NOT cache a public key beyond the freshness of the DID document HTTP response. With no caching headers, the reader SHOULD re-fetch on every feed poll. With `Cache-Control: max-age=N`, the reader MAY cache for `N` seconds.

### 3.6 Signature algorithm

Signatures are detached Ed25519 per RFC 8032 — the 64-byte output of Ed25519 signing over the canonical payload bytes (§6.3), encoded for transport as `base64url` (RFC 4648 §5) without padding.

No HMAC. No hybrid schemes. No JWS, JOSE, or COSE envelope. The signature is the raw 64 bytes, base64url-encoded once, placed in `<af:sig>`.

### 3.7 What identity binds, and what it does not

The signature binds the canonical bytes of the payload to the holder of the private key whose public counterpart was published at the origin's `did.json` at the time the reader resolved it.

It does **not** bind the truth of the payload (the holder may be lying — §9.3), any legal identity, any continuity of the holder over time (a key may have been compromised or sold), or any property of the live API. Only the publisher's _assertion_ about the live API.

A signed feed is forensic substrate, not ground truth. Treat it as such.

---

## §4 Resources

### 4.1 Two artifacts, two URLs

A v0 publisher publishes three artifacts at well-known locations:

| URL                            | What it is                   | Cardinality              |
| ------------------------------ | ---------------------------- | ------------------------ |
| `/.well-known/did.json`        | identity (key)               | one current document     |
| `/.well-known/agent-card.json` | snapshot — current state     | one current document     |
| `/.well-known/agent-feed.xml`  | stream — append-only history | growing append-only Atom |

Identity is §3. Snapshot and stream are the subject of this section.

### 4.2 Why snapshot and stream MUST be separate artifacts

A snapshot answers: "what is true now?" A stream answers: "what became true, and when?" Different questions, different shapes, different consumers. **You cannot reconstruct the second from samples of the first.**

If a publisher only publishes a snapshot and a reader polls it, the reader sees a sequence of states `S0, S1, S2, …`. When adjacent samples differ, the reader can infer "something changed between these polls." But:

- The reader does not know **when** the change happened — only that it happened inside the polling window.
- The reader does not know **how** — one event or several collapsed by the snapshot.
- The reader does not know the **structural delta** — there is no migration hint.
- Two readers polling at different phases reconstruct _different_ histories of the same world.
- Readers who started polling after a change see no evidence it happened.

For a long-running agent whose obligations span a schema migration, or whose audit records must answer "what did the site assert at the moment my agent acted?" — those properties are not optional. The stream is the artifact that has them.

The snapshot still has value: it answers "what is true now?" cheaply, in one fetch, without replaying history. New readers, or readers who do not need temporal precision, can use the snapshot alone.

The two artifacts are complementary. They are not redundant.

### 4.3 The snapshot artifact

The snapshot at `/.well-known/agent-card.json` describes the current state of the origin's machine-readable surface. v0 does **not** specify its schema; that is the province of MCP Server Cards, A2A Agent Cards, OpenAPI documents, or whatever capability description the publisher chooses.

v0 does require: the snapshot MUST exist, MUST be reachable over HTTPS at the well-known location, and MUST be consistent with the most recent applicable feed entry. If the feed says the canonical A2A endpoint is `https://example.com/a2a/v1`, the snapshot MUST also say so. Disagreement is a publisher bug; a reader confronting it is in §2.8 territory.

A v0 reader MAY consult the snapshot for fields the feed does not provide. A v0 reader MUST NOT use the snapshot for _historical_ gaps; only the feed has historical authority.

### 4.4 The stream artifact

The stream at `/.well-known/agent-feed.xml` is an Atom 1.0 document (RFC 4287) extended with the namespace `https://agent-feed.dev/ns/v0`, conventionally bound to `af`. Details in §5 and §6.

The stream MUST be append-only at the level of semantic content (entry ids and their canonical payloads). The publisher MAY re-emit the XML with different formatting, ordering, or whitespace; but the multiset of (entry-id, canonical-payload, signature) tuples MUST grow monotonically, never shrink, and MUST NOT reuse any entry-id for a different canonical payload (§2.9).

A publisher MAY compact the stream — serving only the most recent N entries and archiving older entries elsewhere. v0 does not specify archival mechanics. A previously-present id now absent is not a violation; the reader MAY warn but MUST NOT treat it as termination.

A publisher MUST NOT serve a stream that omits an entry it previously served _and_ serves a newer entry that depends on the omitted one. To keep the feed self-sufficient, the publisher SHOULD include enough prior entries that a fresh reader can establish state from the visible ones.

### 4.5 What does NOT belong in the stream

Status, policy, sybil-evidence, reputation, capability descriptions, marketing copy. None are entries. Anything a reader cannot map to the contract in §2 does not belong here. If you want it in, you are either expanding the protocol (a v0.x or v1 conversation) or misusing the stream.

---

## §5 Entry types

A v0 feed defines exactly three entry types. Each is identified by the
`af:type` element in the entry. Each carries a JSON payload in the
entry's `<content type="application/json">` element. Each is signed
independently per §6.

The three types have different time-constants, different consumers, and
different blast radii. They are kept distinct on purpose.

### 5.1 Common entry envelope

Every v0 entry MUST have:

- An Atom `<id>` element. The value is a publisher-stable URI. It MUST
  be unique within the feed and MUST be stable across re-emissions of the
  same logical event. Convention: `urn:af:<origin-host>:<unix-ms>` or
  `urn:af:<origin-host>:<uuid>`. The reader uses this id for idempotency
  (§2.9).
- An Atom `<updated>` element. RFC 3339 / ISO 8601 timestamp with `Z`
  timezone. This is the publisher's claim about when the fact became
  true, not when the entry was written. The reader records it for audit;
  the reader does not use it for ordering (§2.2).
- An Atom `<title>` element. SHOULD equal the value of `af:type` for
  consistency; readers MUST NOT depend on this and MUST treat title as
  human-facing only.
- An `af:type` element. Exactly one of: `endpoint-announcement`,
  `schema-change`, `deprecation`. Unknown values trigger §2.6 behavior.
- A `<content type="application/json">` element whose text content is
  the canonical JSON form (§6.2) of the type-specific payload defined
  below.
- An `<af:sig type="ed25519">` element. Its text content is the
  base64url-encoded detached Ed25519 signature over the bytes of the
  `<content>` element's text. See §6.3.
- An optional `<af:signer>` element. Its value is the verification
  method id from `did.json` whose key signed this entry. If absent, the
  first `Ed25519VerificationKey2020` in `did.json` is assumed (§3.4).

The signature covers **only** the canonical JSON payload bytes, not the
XML envelope, not the title, not the updated timestamp, not the id. The
XML envelope is transport. If you need to bind a timestamp to the
signature, put it inside the JSON payload (and several entry types do —
they have type-specific timestamps in payload).

### 5.2 `endpoint-announcement`

The publisher asserts: "for this origin, here is the canonical URL that
serves a given protocol, currently at this schema version."

This is the entry that makes a feed self-bootstrapping. A reader joining
fresh can look at the most recent `endpoint-announcement` for each
`(protocol, endpoint-id)` pair and know the current canonical surface,
without replaying the entire schema-change history.

#### Payload fields

```
{
  "endpoint-id": string,        // stable identifier within the origin; MAY equal endpoint
  "endpoint":    string,        // absolute URL or path-relative URL
  "protocol":    string,        // protocol name, e.g. "a2a", "mcp", "rest", "graphql"
  "version":     string,        // schema version label, opaque to the protocol
  "asserted-at": string         // RFC 3339 timestamp; when this assertion took effect
}
```

- `endpoint-id` is the stable identifier the publisher uses to refer to
  this surface across entries. In a typical origin, `endpoint-id` may
  equal `endpoint`; in an origin that hosts versioned endpoints at
  different URLs, `endpoint-id` is the protocol-and-purpose
  ("orders-api"), and `endpoint` is the URL serving that purpose right
  now. Readers key state on `endpoint-id`. If absent, readers MUST
  treat `endpoint` as the `endpoint-id`.
- `endpoint` is what an agent actually calls. If it is path-relative
  (begins with `/`), the reader resolves it against the origin URL.
- `protocol` is opaque to v0 — agent-feed does not validate it. A
  reader uses it as a lookup key in §2.4. Convention: lowercase ASCII.
- `version` is opaque to v0. Convention: semver-shaped, but the
  protocol does not enforce.
- `asserted-at` is the publisher's claim. This is the timestamp the
  reader records as "when the publisher said this was true."

#### Concrete example

```json
{
  "asserted-at": "2026-04-27T12:00:00Z",
  "endpoint": "https://example.com/a2a/v1",
  "endpoint-id": "a2a",
  "protocol": "a2a",
  "version": "1.0"
}
```

Note: the JSON above is shown indented for readability. The on-the-wire
form (the bytes that get signed and embedded in `<content>`) is the
canonical form per §6.2 — sorted keys, no whitespace.

#### Reader effect

Per §2.4: upserts the endpoint record for `(a2a, a2a)`. After this entry
is applied, `reader.canonicalEndpoint(origin, "a2a")` returns
`https://example.com/a2a/v1`.

### 5.3 `schema-change`

The publisher asserts: "endpoint X moved from schema version A to schema
version B at this moment, and here is the structural delta."

#### Payload fields

```
{
  "endpoint-id":   string,
  "from-version":  string,
  "to-version":    string,
  "effective-at":  string,                  // RFC 3339; when the new version began serving
  "migration":     migration-delta
}
```

Where `migration-delta` is a JSON object describing the structural change.
v0 defines four delta operations; future versions may add more (and
readers handle unknowns by §2.6 conservatively — see below):

- `add`: array of strings. Field paths added in `to-version`.
- `remove`: array of strings. Field paths removed in `to-version`.
- `rename`: object. Each key is the old path; each value is the new path.
- `retype`: object. Each key is a field path; each value is an object
  `{ "from": <type-token>, "to": <type-token> }` where type-tokens are
  one of: `string`, `number`, `boolean`, `null`, `object`, `array`,
  `nullable<T>`.

Field paths are JSON Pointer (RFC 6901) fragments without the leading
`#`. Example: `/order/items/0/currency`.

A reader that does not understand a key in the migration delta MUST
preserve that key in the recorded migration (so an agent that _does_
understand it can use it) but MUST NOT use it for live-response
disagreement detection (§2.8). This is the conservative version of §2.6
applied to the migration delta sub-language.

#### Concrete example

```json
{
  "effective-at": "2026-04-27T13:00:00Z",
  "endpoint-id": "orders-api",
  "from-version": "1.0",
  "migration": {
    "add": ["currency"],
    "rename": { "amount": "total" }
  },
  "to-version": "1.1"
}
```

#### Reader effect

Per §2.4: records the migration `1.0->1.1` for `orders-api` and updates
the endpoint's current version to `1.1`. After this entry, when the agent
calls the orders endpoint, it expects to see `currency` and `total` (not
`amount`); §2.8 mismatch fires if it does not.

### 5.4 `deprecation`

The publisher asserts: "endpoint X will be removed on date D. After D,
use Y instead, if Y is given."

#### Payload fields

```
{
  "endpoint-id":  string,
  "announced-at": string,                   // RFC 3339; when the deprecation was announced
  "sunset":       string,                   // RFC 3339; when the endpoint will stop serving
  "replacement":  string-or-null,           // optional; endpoint-id of the successor
  "reason":       string-or-null            // optional; freeform human-readable
}
```

- `endpoint-id` references an endpoint previously announced via
  `endpoint-announcement`. If unknown, reader emits
  `deprecation-of-unknown` and ignores (§2.4).
- `sunset` is the moment the endpoint is no longer guaranteed to serve.
  After this, a reader returns the replacement (if any) or no URL.
- `replacement` is the `endpoint-id` of the successor, not its URL —
  the reader looks the URL up via the latest endpoint-announcement for
  that id. This indirection means the publisher can move the
  replacement URL later without re-issuing the deprecation.
- `reason` is human-facing. Readers MUST NOT condition behavior on
  `reason`; they MAY surface it to the agent for logs.

#### Concrete example

```json
{
  "announced-at": "2026-04-27T14:00:00Z",
  "endpoint-id": "orders-api-v1",
  "reason": "consolidating onto orders-api-v2",
  "replacement": "orders-api-v2",
  "sunset": "2026-10-01T00:00:00Z"
}
```

#### Reader effect

Per §2.4: marks `orders-api-v1` as deprecated with sunset 2026-10-01 and
replacement `orders-api-v2`. Until the sunset, the reader returns the
v1 URL when asked. From the sunset onward, the reader returns the URL
currently associated with `orders-api-v2`, or no URL if v2 was never
announced.

### 5.5 Why exactly these three

- `endpoint-announcement` is the ground truth — without it, `schema-change`
  and `deprecation` have nothing to reference.
- `schema-change` is the load-bearing use case. The whole protocol exists
  because schema changes break agents silently.
- `deprecation` is `schema-change`'s long-form cousin: it announces the
  removal of a whole endpoint rather than the mutation of one inside an
  endpoint, and it has a different time-shape (announcement now, effect
  later).

Status, policy, capability advertisement, sybil claims, reputation —
these are not entry types in v0. They have different time-constants,
different consumers, and different blast radii. Some belong in different
artifacts (snapshot, status page, policy document). Some are deferred
(§9). None belong here. Mixing them would mean a single signing-key
compromise takes down operational telemetry; or that the format must
accommodate the slowest-changing thing in the slowest-changing thing's
shape; or that the consumer for "schema migrated" must learn the
consumer-shape for "rate limit changed". Those are bad trades.

---

## §6 Canonicalization & signing

### 6.1 What gets signed

The signature in `<af:sig>` covers exactly the bytes of the `<content>`
element's text content — which by §6.2 is the canonical JSON encoding of
the entry's payload object. Nothing else.

The signature does **not** cover:

- the entry's `<id>` element,
- the entry's `<title>` element,
- the entry's `<updated>` element,
- the `<af:type>` element,
- the `<af:signer>` reference (if any),
- the surrounding `<feed>` envelope (its `<id>`, `<title>`, `<updated>`,
  `af:spec-version`, `af:feed-status`),
- any HTTP headers,
- any XML attribute on the `<content>` element other than the text it
  contains.

This narrow scope is on purpose. It means a publisher can re-format the
XML wrapper, change `af:feed-status`, re-emit the document with a new
feed-level `<updated>`, or move entries between archives, all without
re-signing entries. The signature is bound to the _fact_ (the JSON
payload), not to the _transport_ (the XML envelope).

A reader MUST verify by reconstructing the canonical-payload bytes
exactly as the publisher would have, then running Ed25519 verify over
those bytes with the appropriate public key from §3.

### 6.2 Canonical JSON encoding

The canonical JSON form of a payload object is the result of:

1. Sort all object keys recursively in lexicographic byte order
   (Unicode codepoint order, equivalently UTF-8 byte order for valid
   keys).
2. Serialize with no whitespace whatsoever — no spaces between tokens,
   no newlines, no tabs.
3. Use double-quoted strings with the standard JSON escape rules.
4. Numbers MUST be finite. NaN, Infinity, and -Infinity are forbidden;
   a publisher emitting any of these is publishing an invalid feed.
5. Numbers MUST be encoded such that decoding yields the same value;
   integer values within IEEE-754 safe range (`±2^53 − 1`) SHOULD use
   no decimal point and no exponent; non-integer numbers SHOULD use
   shortest-round-trip decimal representation.
6. Booleans are `true` and `false`. Null is `null`.
7. Arrays preserve insertion order (arrays are not sorted; only object
   keys are sorted).
8. The output is a valid UTF-8 byte sequence with no BOM.

This is a deliberate subset of JCS (RFC 8785). v0 does not formally
adopt JCS to keep the implementation surface small, but a v0 publisher
MAY use a JCS implementation and produce conformant output, and a v0
reader implementing the rules above will accept JCS output.

### 6.3 Producing the signature

Given canonical payload bytes `P` (the UTF-8 bytes from §6.2) and the
publisher's Ed25519 private key `K_priv`, the signature is:

```
sig = Ed25519-Sign(K_priv, P)         // RFC 8032
```

The 64-byte `sig` is encoded as base64url without padding (RFC 4648 §5)
and placed verbatim into the `<af:sig type="ed25519">` element's text.

### 6.4 Reader verification

Given:

- the canonical payload bytes `P` (the UTF-8 bytes of the `<content>`
  element's text content),
- the base64url-decoded 64-byte signature `sig` from `<af:sig>`,
- the 32-byte public key `K_pub` resolved per §3.4 (using the entry's
  `<af:signer>` value if present, else the default verification method),

verification is:

```
ok = Ed25519-Verify(K_pub, P, sig)    // RFC 8032
```

If `ok` is true, the entry is verified. Otherwise unverified. There is
no third state.

### 6.5 What canonicalization is NOT for

Canonical JSON in v0 is **only** for signing. It is not the format the
agent uses to read the payload — the reader parses it through whatever
JSON parser it uses, on whatever bytes are in the document. Two
implementations can both be conformant readers and both observe the same
feed, even if they sort differently in their internal representations,
as long as they reconstruct the canonical bytes exactly when verifying.

In particular: a publisher's canonical bytes are the only thing that
must match across producer and consumer. The publisher's pretty-print of
the same object, if it ever appeared on the wire, would not verify; that
is not a bug, that is the protocol working.

### 6.6 XML namespace

The XML extension namespace for v0 is:

```
https://agent-feed.dev/ns/v0
```

Conventionally bound to the prefix `af`. A reader MUST recognize the
namespace by its URI, not by its prefix; a publisher MAY use any prefix
including the empty default.

The elements defined in this namespace are: `af:type`, `af:sig`,
`af:signer`, `af:spec-version`, `af:feed-status`. No other `af:` element
is meaningful in v0; readers handle unknown `af:` elements by §2.6.

---

## §7 Versioning & kill switch

### 7.1 `af:spec-version`

Every v0 feed MUST carry an `af:spec-version` element at the feed level
(directly under `<feed>`) whose integer value is `0`.

A reader that supports v0 MUST accept any feed with `af:spec-version` of
`0`. A reader MAY accept feeds with higher integer values if it has been
updated to do so. A v0 reader encountering a feed with
`af:spec-version` greater than `0` and no compatibility shim MUST treat
the feed as having `feed-status: terminated` for the duration of the
session — not because the feed _is_ terminated, but because the reader
cannot vouch for any of its semantics.

This is forward-pessimism: a v0 reader does not know what a v1 entry
type means, what a v1 migration delta operator means, what a v1 trust
field means. It declines to guess.

A publisher migrating from v0 to a future version SHOULD continue to
serve a v0-compatible feed for an overlapping window, either at a
different URL or with a `feed-status: migrated` pointer (§7.3). v0
readers can then continue working until they upgrade.

### 7.2 `af:feed-status`

Every v0 feed MUST carry an `af:feed-status` element at the feed level
whose value is exactly one of:

- `active`
- `terminated`
- `migrated`

These are the only legal values. An unknown value is a v0 violation;
readers SHOULD treat it as `terminated`.

#### `active`

The publisher is currently asserting this feed. Reader proceeds normally
per §2.

#### `terminated`

The publisher has revoked trust in this feed at this URL. As of the
moment a reader sees `terminated`, the reader's per-origin trust flag
becomes `false` (§2.7). All applied state from this origin ceases to
influence future agent queries. The publisher is saying, in effect,
"forget what I told you here."

A `terminated` feed MAY still contain entries; v0 readers MUST NOT apply
them. The publisher is permitted to continue serving the document for
forensic purposes. The feed is dead at the level of agent trust; it is
not necessarily dead at the level of the artifact.

A publisher SHOULD NOT toggle a feed back from `terminated` to `active`
in v0; doing so does not automatically restore reader trust. Readers
MAY require an out-of-band signal (a human operator) to re-trust an
origin once it has been terminated. This is to prevent a compromise
followed by a quiet "nothing-to-see-here" recovery.

#### `migrated`

The publisher has moved to a new feed URL. The `migrated` value is
accompanied by an `af:migrated-to` element at the feed level whose
value is the new feed URL.

A reader observing `migrated`:

1. MUST treat the current feed URL as effectively `terminated` for
   trust purposes — the per-origin trust flag at this URL becomes
   `false`.
2. SHOULD attempt to fetch the feed at the URL given in `af:migrated-to`.
3. MUST resolve identity afresh at the new URL — that is, a new
   `did.json` resolution under whatever DID the new URL implies. The
   same key MAY sign there; the new feed is verified on its own terms.
4. MUST NOT carry the old feed's applied state forward implicitly. The
   new feed bootstraps its own state from its own entries.

`migrated` exists because origins move. A site that genuinely changes
its hostname needs a way to point an existing reader population at the
new location. A reader MAY refuse to follow `af:migrated-to` if the new
URL is on a different hostname under different DNS authority — that is
a reader policy decision, not a protocol mandate.

### 7.3 The kill switch contract

`feed-status: terminated` is the kill switch. It is in v0 because:

- A compromised key or stolen domain is a real risk; the protocol has to
  give the publisher a way to tell readers "stop trusting me here."
- Without it, the only kill mechanism is "remove the file," which a
  reader cannot distinguish from a routine outage.
- A signed `terminated` document is itself a verifiable revocation: it
  says "this revocation came from the same key that signed everything
  else; trust the revocation as you trusted the rest."

The kill switch is intentionally one-way at the protocol level. A
publisher who terminated by mistake does not get to un-terminate by
flipping a value; recovery is an out-of-band conversation with each
reader operator, plus (typically) a key rotation and a fresh start.
That asymmetry exists because the cost of a false-negative termination
(reader keeps trusting a compromised origin) is much higher than the
cost of a false-positive termination (operators have to re-trust a
recovered origin manually).

### 7.4 Versioning of internal vocabularies

`af:spec-version` versions the protocol as a whole — entry types,
canonicalization rules, signing rules, kill-switch semantics. It does
**not** version:

- the publisher's own schema versions (those live inside payloads and
  are opaque to v0),
- the migration-delta sub-language inside `schema-change` (handled by
  §2.6 conservatism — readers preserve unknowns),
- the DID method or key algorithm (a future spec version may permit
  alternatives; v0 is fixed at `did:web` + Ed25519).

When v0.x or v1 ships, it carries a new `af:spec-version` integer. A
reader supporting both versions detects which to apply by the integer.
There is no negotiation, no probing, no content-type dance. The number
is the contract.

---

## §8 Conformance

This section enumerates the testable obligations of conformant
implementations. RFC 2119 keywords define the strength of each.

### 8.1 Conformance categories

A conformant implementation is either:

- a **publisher**, which produces feeds and signs entries;
- a **reader**, which consumes feeds and applies entries;
- both.

An implementation MAY claim partial conformance — for example,
"read-only", "verify-only", "produce-only" — and SHOULD declare which.

### 8.2 Publisher conformance

A conformant publisher:

- MUST publish `did.json` at `/.well-known/did.json` over HTTPS, with
  fields per §3.3.
- MUST publish a feed at `/.well-known/agent-feed.xml` whose top-level
  element is the Atom `<feed>` element with the `agent-feed`
  namespace (§6.6) declared.
- MUST include `af:spec-version` (value `0`) and `af:feed-status` at
  the feed level.
- MUST emit each entry with `<id>`, `<updated>`, `<title>`, `af:type`,
  `<content type="application/json">`, and `<af:sig type="ed25519">`.
- MUST sign each entry's `<content>` text bytes per §6.
- MUST canonicalize JSON per §6.2 before signing.
- MUST keep `af:type` values in the v0 vocabulary (§5).
- MUST keep entry `id` values stable across re-emissions of the same
  semantic event (§2.9, §4.4).
- MUST NOT reuse an entry `id` for a different canonicalized payload.
- MUST publish a snapshot at `/.well-known/agent-card.json` consistent
  with the most recent applicable feed entries (§4.3).
- SHOULD use HTTPS with valid certificates that match the origin's
  hostname.
- SHOULD set sensible `Cache-Control` headers on the feed.
- SHOULD serve content-type `application/atom+xml` for the feed.
- SHOULD serve content-type `application/json` for `did.json` and
  `agent-card.json`.
- MAY archive older entries off-stream once they are no longer needed
  to reconstruct current state from a fresh reader join.
- MUST emit `af:feed-status: terminated` (or `migrated` with
  `af:migrated-to`) when revoking trust in the current feed (§7).

### 8.3 Reader conformance

A conformant reader:

- MUST resolve `/.well-known/did.json` per §3.4 before applying any
  entry from a feed.
- MUST verify each entry's signature per §6.4 before applying it.
- MUST NOT apply unverified entries (§2.5).
- MUST handle unknown entry types by §2.6 — skip and surface, never
  invent semantics.
- MUST apply verified entries in document order (§2.2).
- MUST honor `af:feed-status: terminated` by setting per-origin trust
  to `false` and ceasing to use applied state for that origin (§2.7).
- MUST handle `af:feed-status: migrated` by treating the current URL as
  terminated and SHOULD follow `af:migrated-to` (§7.3).
- MUST emit a `mismatch` event for live-vs-feed disagreements per §2.8;
  MUST NOT silently coerce.
- MUST be idempotent on re-ingest by entry id (§2.9).
- MUST respect polling cadence bounds (§2.10).
- MUST NOT cache public keys past DID document freshness (§3.5).
- SHOULD support each entry type's reader effect as specified in §5.
- SHOULD rate-limit `unverified-entry` and `unknown-entry-type` events
  (§2.5, §2.6).
- MAY consult the snapshot at `/.well-known/agent-card.json` for
  fields the feed does not provide (§4.3); MUST NOT use the snapshot
  for historical reconstruction.

### 8.4 Conformance test categories

Implementations seeking to claim conformance SHOULD pass a battery of
tests in each category. The categories — not the individual tests, which
live with reference implementations — are:

1. **Canonicalization.** Identical inputs in different surface forms
   produce identical canonical bytes. Non-finite numbers rejected.
2. **Signing roundtrip.** Sign-then-verify against the same key
   succeeds; verify against a different key fails; verify against a
   tampered payload fails.
3. **DID resolution.** A published `did.json` is fetched, the
   verification method located, the public key decoded, and a feed
   entry signed by the matching private key verifies. A feed entry
   signed by an unrelated key does not verify.
4. **Entry application.**
   - `endpoint-announcement` records and overwrites prior
     announcements for the same `(protocol, endpoint-id)`.
   - `schema-change` records migrations and updates current version.
   - `deprecation` is honored before and after sunset; replacement
     resolves to the latest endpoint-announcement for that id.
5. **Disagreement detection.** Mismatch event fires when live response
   lacks an announced added field; does not fire when announced added
   field is present.
6. **Forward compatibility.**
   - Unknown entry types are skipped, not applied, not failed-on.
   - Unknown migration-delta keys are preserved in recorded migration
     but not used for §2.8 detection.
   - Future `af:spec-version` integers cause v0 readers to back off.
7. **Kill switch.**
   - `feed-status: terminated` causes per-origin trust flag false,
     applied state stops influencing queries.
   - Toggling back to `active` does not re-trust automatically.
   - `feed-status: migrated` with `af:migrated-to` causes follow on
     reader policy.
8. **Idempotency.**
   - Re-fetching a feed without changes applies nothing new.
   - Reused entry id with new payload fires `replay-mismatch` and is
     not applied.

A reference test suite is published alongside the reference
implementation. Implementations claiming conformance SHOULD reference
the version of the suite they pass against.

### 8.5 What conformance does NOT certify

Passing the v0 conformance suite does **not** certify:

- security against any threat model beyond what §3 binds;
- interoperability with any specific MCP/A2A/etc. consumer surface;
- correct behavior under load, partition, or adversarial publishers;
- agent-level decisions about _what to do_ with a `mismatch` event
  (the protocol specifies the report; agent policy specifies the
  response).

Conformance is a narrow claim. It is not a seal of robustness.

---

## §9 Out of scope (v0)

Each of the following is explicitly deferred from v0. The reasoning is
recorded so future versions know what they are reconsidering, not just
that they are.

### 9.1 Status entries (operational telemetry)

**Out of scope because:** Status — incidents, outages, latency events
— has a different time-constant (minutes), a different audience (humans
and ops dashboards, not agents reasoning about schema), and a different
blast radius (one origin's incident does not invalidate its schema
contracts). Putting status in the same artifact as schema-change means
a key compromise affecting the feed takes down operational telemetry
alongside; the failure modes are coupled where they should not be.
Status pages already exist; v0 stays out of their lane.

### 9.2 Policy entries (pricing, rate limits, ToS-for-agents)

**Out of scope because:** Policy is slow-changing (months to years) and
contractual in shape. It needs to be human-readable, lawyer-readable,
and stable across long agent obligations. An append-only event stream
is the wrong shape for it; a slow-changing document under
`/.well-known/agent-policy.*` (or wherever the ecosystem converges) is
the right shape. v0 does not specify that document either; it merely
declines to braid policy into the stream.

### 9.3 Lying-publisher detection

**Out of scope because:** A signature binds a fact to an origin; it does
not bind the fact to truth. A publisher can sign a stale schema-change
("I changed it back, but I haven't updated the feed"), a wrong one
("I think the new field is `currency` but it's actually `cur`"), or a
deliberately misleading one ("I will sign nothing about my recent
breaking change to keep dependents broken"). Detecting lying publishers
requires either: cross-referencing live behavior against announced
behavior at scale (a reader-side or aggregator-side capability that lies
above v0), reputation systems (which v0 does not define), or
multi-publisher attestation (orthogonal to v0). The §2.8 `mismatch`
event is the substrate on which lying-publisher detection can be built;
it is not detection itself. v0 ships the substrate.

### 9.4 Sybil resistance

**Out of scope because:** v0 binds identity to DNS through `did:web`. An
adversary who controls a domain controls its feed; an adversary who
controls many domains controls many feeds. v0 does not pretend
otherwise. Sybil resistance — making it costly to be many
indistinguishable publishers — is a different problem with different
primitives (proof-of-work, stake, attestation, social graph). It is
addressed by an ecosystem on top of v0, not within v0.

### 9.5 Push transport (WebSub)

**Out of scope because:** A push transport reduces the latency between
"the publisher knows" and "the reader knows," and by §2.10 a poll
window is a window of uncertainty. WebSub (W3C Recommendation) is the
mature standard for Atom push. v0 nonetheless defers it for two
reasons: first, polling is the simpler-to-deploy half (a static file
behind a CDN suffices); second, WebSub's hub-mediated model adds an
operational dependency that is hard to make universal at v0 scale.
Polling is the v0 baseline. A future v0.x extension may add WebSub as
opt-in, with conformance tests for both modes. The choice in v0 is to
ship something publishers can deploy in an afternoon, not to optimize
event-time fidelity.

The cost of this choice: poll-only readers conflate the rate at which
they sample with the moment a fact became true at the origin. Two
readers polling at different phases reconstruct the same event at
different timestamps. v0 accepts that. WebSub-or-equivalent fixes it
later.

### 9.6 Multi-domain delegation

**Out of scope because:** A single legal entity often operates across
many domains (`shopify.com`, `myshopify.com`, `shop.app`, an
infinite-tail of customer-bound subdomains). It would be useful for
one entity to publish one feed and have it authoritative across all of
its domains. v0 does not support this. Each origin publishes for
itself, full stop. Cross-origin trust delegation is a real problem
involving DID method choices, key delegation hierarchies, and trust
roots — none of which v0 specifies. A future version may; v0 does not.
For v0, an operator running N domains publishes N feeds.

### 9.7 Aggregators and registries

**Out of scope because:** A central index of feeds (or a cache, or a
search engine over feeds) is a useful service. It is not part of v0.
v0 is a federation specification: every origin publishes for itself,
every reader reads what it cares about. Building an aggregator is
permitted and likely valuable; specifying one in this document would
muddle the federation contract.

### 9.8 Reader identification on fetch

**Out of scope because:** A publisher might want to know which agent
fetched its feed, for rate-limiting or analytics. A reader might want
to identify itself for higher-quality service. v0 does not specify any
authentication or identity headers on the read side. A reader is HTTP;
a publisher returns HTTP. Identity on fetch is between reader and
publisher, possibly via existing mechanisms (TLS client certs, mTLS,
bearer tokens) outside the scope of this protocol.

### 9.9 Encrypted entries

**Out of scope because:** v0 entries are integrity-protected (signed)
but not confidentiality-protected. Anyone who can fetch the feed can
read the entries. This is intentional: the public web is the deployment
surface, and selective disclosure is a different problem with different
primitives (capability tokens, encrypted payloads, separate
confidentiality channels). A publisher who needs confidentiality
publishes elsewhere.

---

## §10 Open issues

Each of the following is an unresolved tension surfaced during design. The protocol takes a position on each — not because the position is final, but because leaving them open makes v0 untestable. A position can be changed in v0.x; a non-position cannot be implemented.

### 10.1 Bootstrapping order

**Tension.** A protocol with no readers is a write-only fact stream. A protocol with no publishers gives readers nothing to read. Webmention died on this axis; RSS survived because Netscape shipped a reader at the moment publishers had reason to publish.

**Position.** v0 ships with a reference reader and a reference publisher. The reference reader is the protocol's first consumer; without it, there is no protocol. The deployment plan is: stand up the reference reader against three operating origins (one fixture, two real surfaces), then reach out for consumer adoption. A consumer commitment is sought, not made a precondition. The reader's behavioral contract (§2) is the artifact a future consumer commits _to_, and §2 is now written. The opposing "no consumer commitment, no project" stance is a useful vapor check but applied strictly produces a deadlock; v0's compromise is to make producer cost zero and consumer cost small, so both sides can move without either committing first.

### 10.2 Ship-and-walk-away

**Tension.** Once a few origins publish, bug reports arrive. A protocol whose authors disclaim ownership rots. A protocol held tightly cannot be cleanly donated to a WG when adoption justifies it.

**Position.** v0 is owned, not abandoned. The reference repository is maintained; issues are triaged; breaking changes are not made silently. Donation to a working group is an option, not a posture, and becomes appropriate only after at least one independent reader implementation and three publisher implementations have shipped against the same conformance suite. This is "own the bug reports until the work has demonstrated it can be owned by more than one party."

### 10.3 Polling load on origins

**Tension.** v0 is poll-only (§9.5). An origin with N agents polling every 60s is hit 60×N times per hour. At 10,000 publishers × 1,000 readers each, that is real load that feeds back into adoption.

**Position.** v0 specifies a 60-second floor and 24-hour ceiling (§2.10). Readers MUST honor `Cache-Control` and `ETag` within that range; a publisher serving `max-age=600` is entitled to ten-minute polling. v0 accepts polling load as a real cost and points at WebSub as the mitigating future extension (§9.5). Publishers behind CDNs absorb most of the cost; publishers without CDNs at scale will need to raise their cache ceilings or move to push mode when it ships. v0 does not pretend the problem is solved.

### 10.4 Shopify-shaped publisher incentive

**Tension.** The most valuable publishers — large platforms whose schema changes break the most agents — have the weakest incentive to publish a feed. A schema change that breaks third-party integrators _helps_ lock-in. Why would such a publisher voluntarily make it easier for third-party agents to survive their schema changes?

**Position.** v0 does not solve this incentive problem and does not pretend to. Adoption among Shopify-shaped publishers, if it happens, will come from one of three pressures outside v0's control: customer pressure (their own merchants lose money when integrating agents break), regulatory pressure ("machine-readable announcement of API change" codified as platform obligation), or competitive pressure (a challenger publishes a feed and makes "agents survive our schema changes" a wedge). v0's contribution is to make the publishing cost trivially low (a signed static file) so that when pressure bites, implementation cost is not the obstacle. Lower the floor; do not try to raise the demand.

### 10.5 Lying-publisher

**Tension.** A signed feed entry binds bytes to origin, not to truth (§3.7, §9.3). A publisher can sign a false schema-change. v0 provides no detection mechanism.

**Position.** v0 ships the substrate (the §2.8 `mismatch` event) without shipping detection. Detection requires cross-referencing observed behavior against announced behavior across many readers and possibly many publishers — a layer above v0. A reader observing repeated mismatches against a single publisher has the data to escalate (to a human, an aggregator, a reputation service); the action is not v0's to specify. The alternative — making detection part of v0 — would require either a reputation primitive or a multi-reader consensus mechanism, and either would make v0 significantly larger. Keep v0 small; expose the substrate; let the detection layer evolve.

---

## Appendix A: Referenced specifications

This document does not reproduce any of the following. It references
them and depends on their existence:

- **W3C Decentralized Identifiers (DIDs) v1.0** — DID syntax and DID
  document model.
- **W3C `did:web` Method Specification** — resolution of `did:web` to
  `/.well-known/did.json` over HTTPS.
- **RFC 4287** — The Atom Syndication Format. Referenced for `<feed>`,
  `<entry>`, `<id>`, `<title>`, `<updated>`, `<content>`, namespacing.
- **RFC 8615** — Defining Well-Known URIs.
- **RFC 8032** — Edwards-Curve Digital Signature Algorithm (EdDSA),
  including Ed25519.
- **RFC 4648 §5** — base64url encoding without padding.
- **RFC 6901** — JSON Pointer, used in `schema-change` migration deltas.
- **RFC 3339** — Date and Time on the Internet.
- **RFC 2119** — Key words for use in RFCs to Indicate Requirement
  Levels.
- **RFC 8785** (informational reference) — JSON Canonicalization Scheme
  (JCS); v0 specifies a deliberate subset, not adoption.

A v0 implementer is expected to have read the above where relevant, or
to have library support that has. v0 inherits their semantics by
reference.

## Appendix B: Glossary

- **Agent.** A program acting on behalf of a principal that consumes agent-feed entries to maintain a model of an origin's machine-readable surface.
- **Append-only.** A property of the stream (§4.4): the multiset of (entry-id, canonical-payload, signature) tuples grows monotonically and never shrinks.
- **Canonical JSON.** The deterministic byte-encoding defined by §6.2.
- **Detached signature.** Signed bytes and signature transported separately. v0's `<af:sig>` is a detached Ed25519 signature over the canonical payload bytes.
- **Endpoint.** A URL serving a particular protocol surface for an origin.
- **Endpoint-id.** A stable identifier (within an origin) for an endpoint, used as the cross-entry key. May or may not equal the URL.
- **Entry.** An Atom `<entry>` element carrying one v0 fact.
- **Feed.** The stream artifact at `/.well-known/agent-feed.xml`.
- **Origin.** An (HTTPS scheme, host, port) triple per RFC 6454, here inferred from the URL where `did.json` is served.
- **Publisher.** The party operating an origin and signing its feed.
- **Reader.** The library or service that ingests feeds on behalf of an agent and exposes the §2 contract.
- **Snapshot artifact.** The current-state document at `/.well-known/agent-card.json`. Schema not specified by v0; existence and consistency are.
- **Stream artifact.** The append-only feed at `/.well-known/agent-feed.xml`.
- **Verified entry.** An entry whose detached signature successfully validates under the resolved DID public key against the canonical payload bytes.

---

End of v0 specification.
