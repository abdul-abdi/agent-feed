---
title: "agent-feed v0: Signed Announcements for the Agentic Web"
abbrev: agent-feed
docname: draft-abdi-agent-feed-00
category: std
ipr: trust200902
date: 2026-04-27
author:
  - ins: A. Abdi
    name: Abdullahi Abdi
    org: Independent
    email: abdullahiabdi1233@gmail.com
---

# Abstract

This document specifies agent-feed, a protocol-neutral, web-native, signed
announcement plane that lets an HTTP origin tell autonomous software agents
that something has changed about the origin's machine-readable surface.
Origins publish an append-only Atom [RFC4287] feed at a well-known location
[RFC8615], identified and authenticated by a `did:web` document [W3C-DID-WEB]
under [W3C-DID], with detached Ed25519 signatures [RFC8032] over a
canonical JSON encoding of each entry's payload. The protocol is concerned
with the temporal layer beneath capability snapshots: it carries the events
"this endpoint is canonical for this protocol", "this endpoint's schema
changed in the following way", and "this endpoint is being deprecated."
agent-feed is neutral with respect to MCP, A2A, and other agent transport
protocols.

# Status of This Memo

This Internet-Draft is submitted in full conformance with the provisions of
BCP 78 and BCP 79.

Internet-Drafts are working documents of the Internet Engineering Task Force
(IETF). Note that other groups may also distribute working documents as
Internet-Drafts. The list of current Internet-Drafts is at
<https://datatracker.ietf.org/drafts/current/>.

Internet-Drafts are draft documents valid for a maximum of six months and
may be updated, replaced, or obsoleted by other documents at any time. It is
inappropriate to use Internet-Drafts as reference material or to cite them
other than as "work in progress."

This Internet-Draft will expire on 2026-10-27.

# Copyright Notice

Copyright (c) 2026 IETF Trust and the persons identified as the document
authors. All rights reserved.

This document is subject to BCP 78 and the IETF Trust's Legal Provisions
Relating to IETF Documents (<https://trustee.ietf.org/license-info>) in
effect on the date of publication of this document. Please review these
documents carefully, as they describe your rights and restrictions with
respect to this document. Code Components extracted from this document must
include Revised BSD License text as described in Section 4.e of the Trust
Legal Provisions and are provided without warranty as described in the
Revised BSD License.

--- middle

# Introduction

The web has long carried two structurally distinct kinds of machine-readable
artifact at well-known URLs. One kind describes what is true now: examples
include `robots.txt`, `sitemap.xml`, and OpenAPI documents. The second kind
describes what became true and when: Atom [RFC4287] feeds, changelogs, audit
logs. The first kind is a snapshot. The second kind is a stream.

The emerging ecosystem of agent protocols, including the Model Context
Protocol [MCP] and the Agent2Agent (A2A) Protocol [A2A], has produced
several capability-snapshot formats. None of those formats describe when
and how a capability changed. An agent that depends only on a snapshot to
maintain a long-running model of an origin's surface cannot distinguish
"the surface is the same as last poll" from "I missed an event between
polls and reconstructed a different history than my peer."

You cannot reconstruct history by sampling state. Two readers polling a
single snapshot URL at different phases observe different transition
sequences over the same world. A reader that joins after a change has no
record that the change occurred. A reader that catches the snapshot mid-
update sees a state that never existed atomically. None of these failure
modes are observable from inside the snapshot.

agent-feed addresses the gap by specifying an append-only, signed event
stream that an origin publishes alongside its snapshot. The stream carries
small facts the origin asserts about its own machine-readable surface:
which endpoint is canonical for a given protocol, that a particular
endpoint's schema has changed, that a particular endpoint is being
deprecated. Each entry is independently signed with detached Ed25519
[RFC8032] over a canonical JSON encoding of its payload. The signing key
is bound to the origin via `did:web` [W3C-DID-WEB].

The protocol does not specify a transport for agent-to-agent communication;
it is neutral with respect to [MCP], [A2A], and similar work. It does not
specify the snapshot format; existing capability-description formats serve
that role. It does not specify a registry or central directory; every
origin publishes for itself. It does not define discovery; a reader is
presumed to already know which origins it cares about.

The design philosophy is to lean on long-standing web primitives that have
demonstrated durability: Atom for the feed envelope, well-known URIs
[RFC8615] for the artifact location, HTTPS for transport, Ed25519 for
signing, and JSON for payload structure. Every primitive in this document
is over a decade old in production deployment. The novelty is not in any
component; it is in the composition.

This document is organized to put the consumer contract before the producer
schema, because the consumer contract is the load-bearing artifact. Producers
exist to satisfy consumers; the schema in {{entry-types}} is whatever shape
lets a conformant reader behave as specified in {{reader-contract}}.

# Conventions and Definitions

The key words "MUST", "MUST NOT", "REQUIRED", "SHALL", "SHALL NOT",
"SHOULD", "SHOULD NOT", "RECOMMENDED", "NOT RECOMMENDED", "MAY", and
"OPTIONAL" in this document are to be interpreted as described in BCP 14
[RFC2119] [RFC8174] when, and only when, they appear in all capitals, as
shown here.

The following terms are used throughout this document:

Origin:
: An (HTTPS scheme, host, port) triple per [RFC6454], here inferred from
the URL at which the `did.json` document is served. An origin SHALL
serve all three artifacts defined by this protocol from its own host.

Publisher:
: The party operating an origin and signing its feed. The publisher holds
the private key whose public counterpart is published in the origin's
`did.json`.

Reader:
: A library or service that ingests feeds on behalf of an agent. The
reader implements the behavioral contract in {{reader-contract}}.

Agent:
: A program, typically partially autonomous, acting on behalf of a
principal. An agent consumes the reader's outputs to maintain a model
of an origin's machine-readable surface.

Entry:
: An Atom `<entry>` element [RFC4287] carrying one fact about the
origin's surface, signed independently per {{canonicalization}}.

Feed:
: The append-only stream artifact at `/.well-known/agent-feed.xml`.

Snapshot:
: The current-state document at `/.well-known/agent-card.json`. The
schema of this document is not specified by this protocol; only its
existence and consistency.

Endpoint:
: A URL serving a particular protocol surface for an origin.

Endpoint-id:
: A stable identifier within an origin for an endpoint, used as the
cross-entry key for state. The endpoint-id MAY equal the endpoint URL,
but is not required to.

Schema-change:
: An event in which an existing endpoint begins serving a new schema
version. The publisher describes the structural delta in the entry
payload.

Deprecation:
: An event in which the publisher announces a future sunset date for an
endpoint, optionally referencing a successor endpoint-id.

Verified entry:
: An entry whose detached signature successfully validates under the
public key resolved per {{identity}} against the canonical payload
bytes per {{canonicalization}}.

Append-only:
: A property of the feed: the multiset of (entry-id, canonical-payload,
signature) tuples grows monotonically. Entries MUST NOT be removed in
a way that breaks dependency, and an entry-id MUST NOT be reused for
a different canonical payload.

Canonical JSON:
: The deterministic byte-encoding of a JSON value defined in
{{canonical-json}}.

Detached signature:
: A signature transported alongside the signed bytes rather than wrapped
around them. The signed bytes and signature are independently
serializable.

Document order:
: The order in which entries appear in the XML document, as parsed. This
is the publisher's stated order and is the source of truth for entry
application order; see {{on-receipt}}.

Asserted-at, effective-at, sunset, announced-at:
: Timestamps inside payloads. These are publisher claims about when a
fact became true (or will). They are distinct from the Atom-level
`<updated>` element, which is forensic only.

# Reader Behavioral Contract {#reader-contract}

This section defines the obligations of a conformant reader. The producer
schema in {{entry-types}} is derivative: it is whatever shape lets a
reader behave as specified here. A reader is the interface against which
agents are written; the schema is an implementation detail of how the
contract is delivered.

## Reader State {#reader-state}

A conformant reader MUST maintain the following per-origin state:

Trust flag:
: A boolean. Initially `true` for any origin the reader has begun
ingesting. Becomes `false` when the origin's most recent feed declares
`feed-status: terminated` per {{versioning}}. Once `false`, all of
that origin's entries -- past and future -- MUST cease to influence
agent behavior at this URL until a human operator explicitly re-trusts
the origin out of band. A `feed-status: migrated` value MUST be
treated as `terminated` for trust at this URL, with the additional
behavior in {{feed-status-migrated}}.

Endpoint table:
: A mapping from `(protocol, endpoint-id)` to an endpoint record. An
endpoint record carries the URL, the current schema version, the
migration history into the current version, and any pending
deprecation. The exact in-memory shape is implementation-defined; the
reader MUST be able to answer the queries in {{apply-by-type}}.

Last-seen identifier:
: The Atom `<id>` of the most recent entry the reader has applied for
this origin. Used for idempotency per {{idempotency}}.

A reader MAY maintain richer state. A reader MUST NOT maintain less.

## Per-feed Ingestion Procedure {#on-receipt}

Before applying any entry from a feed document, the reader MUST perform
the following steps in order:

1. Resolve the origin's DID document at `<origin>/.well-known/did.json`
   over HTTPS per {{identity}}. If resolution fails, the reader MUST
   NOT apply any entry from the feed. The previous trust state for the
   origin is unchanged. The reader SHOULD surface a `did-unreachable`
   event.

2. Extract the verification key per {{key-resolution}}.

3. Parse the feed XML per {{xml-namespace}}.

4. Read the feed-level `af:feed-status` element per {{versioning}}.

5. For each `<entry>` element, in document order, perform per-entry
   verification per {{verification}} before per-entry application per
   {{apply-by-type}}.

Document order matters. A reader MUST apply entries in the order they
appear in the parsed XML, NOT in any order derived from the entry's
`<updated>` timestamp. The publisher's stated order is authoritative for
the application sequence; timestamps are forensic display only.

The rationale for using document order rather than timestamp order is
that timestamps are publisher claims, can be inconsistent across entries
written by independent processes, and may be intentionally adjusted for
backdating. Document order is the order the publisher chose to present;
it is the publisher's commitment to causality within the feed.

<CODE BEGINS>

procedure ingest-feed(origin):
did-doc <- fetch(origin / "/.well-known/did.json")
if did-doc is unreachable or malformed:
emit "did-unreachable" or "did-malformed"
return
keys <- extract-verification-methods(did-doc)
feed <- fetch-and-parse(origin / "/.well-known/agent-feed.xml")
spec-version <- feed.af:spec-version
if spec-version > 0 and reader does not support:
treat as terminated for this session; return
feed-status <- feed.af:feed-status
if feed-status == "terminated":
set trust-flag(origin) <- false
return
if feed-status == "migrated":
set trust-flag(origin) <- false
maybe-follow(feed.af:migrated-to)
return
for entry in feed.entries (document order):
verify-and-apply(entry, keys, origin)

<CODE ENDS>

## Per-entry Verification {#verification}

For each entry, the reader MUST perform the following:

1. Extract the canonical payload bytes from the `<content>` element. The
   bytes are the UTF-8 octets of the element's text content, exactly as
   they appear after XML parsing has resolved entity references. They
   are not the textual representation in the source document if the
   parser has changed it (for example, by normalizing line endings); but
   in practice an XML parser preserves these bytes.

2. Extract the signature bytes from `<af:sig>`. The text of `<af:sig>`
   is base64url-encoded [RFC4648] without padding. The decoded bytes
   MUST be exactly 64 octets.

3. Resolve the verification key for this entry. If `<af:signer>` is
   present, the reader MUST use the verification method from `did.json`
   whose `id` matches. Otherwise, the reader MUST use the first
   `Ed25519VerificationKey2020` entry in `did.json`'s
   `verificationMethod` array.

4. Verify the signature against the canonical payload bytes using the
   resolved 32-byte Ed25519 public key per [RFC8032].

5. If verification succeeds, mark the entry verified and proceed to
   {{apply-by-type}}.

6. If verification fails, mark the entry unverified and proceed to
   {{unverified}}.

A reader MUST NOT apply an unverified entry. There is no partial credit.
An entry whose signature does not verify is, for the purposes of this
protocol, not an entry but bytes.

<CODE BEGINS>

procedure verify-and-apply(entry, keys, origin):
payload <- bytes-of(entry.content)
sig <- base64url-decode(entry.af:sig)
key-id <- entry.af:signer or default-key-id
pubkey <- find(keys, key-id)
if pubkey is None:
emit "unverified-entry"
return
if not Ed25519-Verify(pubkey, payload, sig):
emit "unverified-entry"
return
type <- entry.af:type
if type not in {endpoint-announcement, schema-change, deprecation}:
emit "unknown-entry-type"
return
if entry.id has been applied before:
if same canonical payload and signature: skip silently
else: emit "replay-mismatch"; return
apply-by-type(type, parse-json(payload), origin)
record-applied(entry.id, payload, sig)

<CODE ENDS>

## Apply by Entry Type {#apply-by-type}

This subsection specifies the reader's behavior for each verified entry
type. Future versions of this protocol MAY define additional entry types;
a v0 reader handles unknown types per {{unknown-types}}.

### endpoint-announcement {#apply-announcement}

The publisher asserts: for this origin, the canonical URL serving a given
protocol is X, currently at schema version V. The reader MUST upsert the
endpoint record for the key `(payload.protocol, payload.endpoint-id)` so
that, after application:

- the recorded URL is `payload.endpoint`;
- the recorded current version is `payload.version`;
- the recorded protocol is `payload.protocol`;
- any prior migrations remain in the migration history;
- any prior deprecation persists, except that if the deprecation
  referenced a replacement endpoint-id that is now itself the subject
  of an `endpoint-announcement`, the reader's resolution of the
  replacement to a URL MAY be updated.

If a prior `endpoint-announcement` existed for the same `(protocol,
endpoint-id)` and a different URL, the new announcement replaces the URL.
The reader MUST NOT keep parallel records of "old URL" and "new URL"
under this entry type. Migration of URL through a sunset window is the
responsibility of `deprecation`, not of `endpoint-announcement`.

<CODE BEGINS>

procedure apply-endpoint-announcement(payload, origin):
key <- (payload.protocol, payload.endpoint-id or payload.endpoint)
rec <- origin.endpoints[key] or new-record()
rec.url <- resolve(payload.endpoint, origin)
rec.version <- payload.version
rec.protocol <- payload.protocol
origin.endpoints[key] <- rec

<CODE ENDS>

### schema-change {#apply-schema-change}

The publisher asserts: endpoint X moved from schema version A to B at
the indicated moment, and here is the structural delta. The reader MUST:

- locate the endpoint record by `payload.endpoint-id`. If no such record
  exists, the reader MUST synthesize a record with current version equal
  to `payload.from-version` and no URL, and proceed; the URL will be
  filled by a later `endpoint-announcement`. (A reader MAY emit a
  `schema-change-of-unknown` event for visibility, but MUST apply
  the migration regardless, because the `endpoint-announcement` may
  appear later in document order or in a subsequent feed.)

- record the migration delta keyed by `payload.from-version + "->" +
payload.to-version`. The reader MUST preserve unknown keys in the
  migration delta object so that an agent that understands them can
  use them; the reader MUST NOT use unknown keys in disagreement
  detection per {{disagreement}}.

- update the recorded current version to `payload.to-version`.

<CODE BEGINS>

procedure apply-schema-change(payload, origin):
rec <- find-by-endpoint-id(origin, payload.endpoint-id)
or synthesize-record(payload.endpoint-id,
payload.from-version)
key <- payload.from-version + "->" + payload.to-version
rec.migrations[key] <- payload.migration
rec.version <- payload.to-version

<CODE ENDS>

### deprecation {#apply-deprecation}

The publisher asserts: endpoint X will be removed on date D. After D,
use Y instead, if Y is given. The reader MUST:

- locate the endpoint record by `payload.endpoint-id`. If no such record
  exists, the reader MUST emit a `deprecation-of-unknown` event and MUST
  NOT apply the entry's effects (because there is no endpoint to
  deprecate). The entry remains verified; only its effect is voided.

- record the sunset date and replacement endpoint-id (if any) on the
  endpoint record.

After application, the reader's URL-resolution behavior is:

- For queries received before `payload.sunset`, the reader returns the
  URL recorded for `payload.endpoint-id`.

- For queries received on or after `payload.sunset`, the reader returns
  the URL associated with `payload.replacement` if that endpoint-id has
  a current `endpoint-announcement`. The reader emits
  `deprecated-and-sunset` once per query that crossed the sunset
  boundary.

- For queries received on or after `payload.sunset` where no
  `replacement` is known, the reader returns no URL. The agent decides
  what "no URL" means in its own context; this protocol does not.

The replacement field references a `payload.endpoint-id`, not a URL.
This indirection allows the publisher to move the replacement URL later
through a subsequent `endpoint-announcement` without re-issuing the
deprecation.

<CODE BEGINS>

procedure apply-deprecation(payload, origin):
rec <- find-by-endpoint-id(origin, payload.endpoint-id)
if rec is None:
emit "deprecation-of-unknown"
return
rec.deprecated <- {
sunset: payload.sunset,
replacement: payload.replacement,
reason: payload.reason
}

procedure resolve-url(origin, endpoint-id):
rec <- find-by-endpoint-id(origin, endpoint-id)
if rec is None: return None
if rec.deprecated and now() >= rec.deprecated.sunset:
r <- rec.deprecated.replacement
if r is not None:
return resolve-url(origin, r)
return None
return rec.url

<CODE ENDS>

## Unverified Entries {#unverified}

When an entry's signature does not verify, the reader MUST:

- not apply the entry;
- emit an `unverified-entry` event identifying the entry's `<id>` and
  the feed URL;
- continue processing subsequent entries.

One bad signature is not authority to revoke trust in the publisher.
Only `feed-status: terminated` does that, per {{feed-status-terminated}}.
A reader SHOULD rate-limit `unverified-entry` events to avoid amplifying
adversarial entries that exist primarily to flood the reader's event
channel.

A reader MUST NOT continue under the assumption that the entry's payload
is meaningful for any other purpose. The bytes are not promoted to
state.

## Unknown Entry Types {#unknown-types}

If `af:type` is not one of the values defined in {{entry-types}}, the
reader MUST:

- skip the entry without applying it;
- NOT treat it as unverified -- the signature MAY be valid, and the
  signature scope (the canonical JSON payload bytes) does not depend on
  the type. The reader simply does not understand the type;
- emit an `unknown-entry-type` event identifying the type string and
  the entry's `<id>`;
- continue processing subsequent entries.

A v0 reader does not invent semantics for unknown types. It records
nothing. It logs and moves on. This is the conservative posture
required by forward compatibility: a future entry type might be a
`status` entry whose semantics override schema-change semantics, and a
v0 reader has no way to know.

A reader SHOULD rate-limit `unknown-entry-type` events.

## Feed Status Transitions {#feed-status-transitions}

The reader's reaction to the feed-level `af:feed-status` element is
specified in {{versioning}}. The following summary is normative for
the reader contract:

- `active`: proceed normally.

- `terminated`: the per-origin trust flag becomes `false`. Past entries
  cease to influence future queries. The reader MUST NOT silently
  "undo" applied state, but MUST NOT use it for future queries either.
  An agent that wishes to fall back to last-known-good state may do so
  with warnings; that decision is not the reader's to make.

- `migrated`: equivalent to `terminated` for trust at this URL. The
  reader SHOULD follow `af:migrated-to` to a new URL where verification
  and ingestion start fresh. The reader MUST NOT carry the old feed's
  applied state forward implicitly. See {{feed-status-migrated}}.

A reader observing a transition from `terminated` back to `active`
across two ingestions of the same URL MUST NOT silently re-trust the
origin. Re-trust requires an out-of-band signal from the operator.

## Disagreement with the Live World {#disagreement}

This subsection specifies the reader's behavior when the agent's
observation of a live response from an endpoint disagrees with the
schema the feed has predicted. Two cases occur in practice. A third
case (live API unreachable) is treated as a transport event and not as
disagreement.

The reader exposes an operation `observe-live-response(endpoint-id,
response-shape)` to the agent. The agent invokes it after receiving a
response from a known endpoint, passing a representation of the
response's structural shape (the set of field paths present, with
types). The reader's behavior is specified below.

### Case A: Predicted-and-matched {#disagreement-match}

Recorded state for `orders-api`: at version 1.1, migrated from 1.0 by
adding `currency`. The agent observes a response with `currency`
present.

The reader walks the most recent migration into the current version and
checks each operator against the response shape:

- For each path in `migration.add`, if the path is present in the
  response, no event is emitted. If absent, see {{disagreement-mismatch}}.

- For each path in `migration.remove`, if the path is present in the
  response, see {{disagreement-mismatch}}. If absent, no event.

- For each path in `migration.rename`, if the old path is present in
  the response, see {{disagreement-mismatch}}. If only the new path is
  present, no event.

- For each path in `migration.retype`, the type-token check is
  best-effort and SHOULD be performed if the reader has access to the
  observed value's type. Retype mismatches MUST emit per
  {{disagreement-mismatch}}.

In the all-match case, no event fires. The reader has confirmed the
feed's prediction against the world.

### Case B: Predicted-and-mismatched {#disagreement-mismatch}

Recorded state for `orders-api` at version 1.1, migrated from 1.0 by
adding `currency`. The agent observes a response that lacks `currency`,
or contains a field `tax_rate` no feed entry has mentioned.

The reader MUST emit a `mismatch` event with structure:

<CODE BEGINS>

event "mismatch" {
origin: string
endpoint-id: string
expected-version: string
observed-discrepancy: {
expected-but-missing: list<json-pointer>,
observed-but-unannounced: list<json-pointer>,
retype-mismatch: list<{path, expected-token, observed-token}>
}
fallback-version: string-or-null
}

<CODE ENDS>

`fallback-version` is the most recent version the reader has reason to
believe the world supports. It is computed as the version preceding the
most recent migration's `to-version`, or null if no prior version is
recorded.

The reader MUST NOT silently coerce the response into the announced
shape. The reader MUST NOT auto-rollback its recorded current version
to the fallback. The reader MUST NOT re-fetch the feed in response to
the mismatch -- that would conflate "the world is wrong" with "the
world updated and I missed it." Re-fetching the feed is the reader's
scheduled poll behavior, not a reaction to a single live response.

The reader reports the disagreement and the fallback. The agent
decides whether to retry against the fallback URL, fail the operation,
escalate to a human, or trust the live response over the feed.
This separation of concern is deliberate: the reader reports facts, the
agent applies policy.

### Case C: Live API unreachable {#disagreement-unreachable}

This is not a feed-vs-world disagreement. It is a transport event. The
reader does nothing. The agent handles transport failures via its
existing mechanisms.

## Re-ingestion Idempotency {#idempotency}

A reader MUST be idempotent on re-ingestion of the same feed:

- An entry whose Atom `<id>` matches an already-applied entry's `<id>`
  AND whose canonical payload and signature match what was previously
  applied MUST be skipped silently. No re-application. No event.

- An entry whose `<id>` matches a previously-applied entry but whose
  canonical payload OR signature differs MUST trigger a `replay-mismatch`
  event identifying the entry's `<id>` and the feed URL. The reader
  MUST NOT apply the new content. Reusing an `<id>` for a different
  canonical payload violates the append-only contract per
  {{stream-artifact}}.

A reader MAY use HTTP conditional-GET ([RFC9110] `If-None-Match`,
`If-Modified-Since`); idempotency is required at the entry-id level
regardless of HTTP-level caching outcome.

## Polling Cadence {#polling}

A reader SHOULD poll each origin at most once per 60 seconds and at
least once per 24 hours. The lower bound prevents denial-of-service
against publishers; the upper bound prevents "feed death by neglect"
in which a reader fails to observe a fact whose announcement preceded
its session.

A reader SHOULD honor `Cache-Control` and `ETag` headers within those
bounds [RFC9110]. A publisher returning `max-age=600` is asking for
ten-minute granularity; a reader SHOULD comply. A reader MAY support
push-mode delivery if and when a future version of this protocol
defines one; the v0 baseline is poll-only.

A reader MAY exceed the 60-second floor for an explicit operator
trigger (for example, a manual "refresh" command). Such triggers
SHOULD NOT be applied automatically based on application logic, since
that is the path to feed-DoS-by-loop.

## What the Reader Does Not Do {#reader-non-goals}

A conformant v0 reader does NOT:

- decide whether the publisher is "trustworthy" beyond signature
  verification (see {{security}});
- maintain per-publisher reputation scores;
- aggregate state across origins (each origin is independent);
- emit telemetry to any third party;
- modify outgoing requests on the agent's behalf to match the recorded
  schema. The agent does that, using migration data the reader has
  recorded;
- delete past state. Even after `terminated`, the historical record is
  preserved for audit; only consultation ceases.

A reader that does any of these is providing functionality on top of
v0, not part of v0.

# Identity {#identity}

This section specifies how a reader resolves a public verification key
for an origin and what claims a signature binds.

## Identity Claim Scope {#identity-scope}

The protocol asserts exactly this: the canonical bytes of an entry's
payload were signed by the holder of the Ed25519 private key whose
public counterpart is published at the origin's
`/.well-known/did.json` under the DID `did:web:<host>` (or
`did:web:<host>:<port>` for non-default ports), as resolved at the time
of the reader's ingestion.

The protocol does not assert that the holder is honest, that the holder
is the same legal entity as last year, or that the holder is bound to
any other identity system. A signature binds bytes to a key, and a key
to a hostname, by virtue of [W3C-DID-WEB] resolution.

## DID Method {#did-method}

The DID method is `did:web` per the W3C `did:web` Method Specification
[W3C-DID-WEB], within the framework of W3C Decentralized Identifiers
(DIDs) v1.0 [W3C-DID]. A v0 publisher MUST publish a `did:web` document
at `<origin>/.well-known/did.json` over HTTPS. The DID document is part
of identity, separate from the feed.

`did:web:<host>` resolves to `https://<host>/.well-known/did.json`.
For non-default ports, `did:web:<host>%3A<port>` resolves to
`https://<host>:<port>/.well-known/did.json`. The encoding rules of
[W3C-DID-WEB] apply.

## Required DID Document Fields {#did-fields}

A v0 DID document MUST contain:

- `id`: the DID, of the form `did:web:<host>` or `did:web:<host>%3A<port>`,
  matching the host (and port, if non-default) at which the document is
  served.

- `verificationMethod`: an array with at least one entry.

The verification method whose `id` matches the entry's `<af:signer>`
value, or the first entry in the array if no `<af:signer>` element is
present, MUST contain:

- `type`: `Ed25519VerificationKey2020`.

- `controller`: the DID itself.

- `publicKeyMultibase`: a multibase-encoded raw 32-byte Ed25519 public
  key. The multibase prefix indicates the encoding used.

Additional verification methods MAY be present in the array. v0 readers
MAY ignore additional methods, except that `<af:signer>` references
MUST be honored.

## Key Resolution by Readers {#key-resolution}

A v0 reader, given an origin URL, MUST:

1. Fetch `<origin>/.well-known/did.json` over HTTPS per [RFC8615].

2. Confirm that `id` in the parsed document matches `did:web:<host>`
   for the queried host (or `did:web:<host>%3A<port>` for non-default
   ports).

3. Locate the verification method whose `id` matches the entry's
   `<af:signer>` value. If no `<af:signer>` is present, locate the
   first verification method whose `type` is
   `Ed25519VerificationKey2020`.

4. Decode `publicKeyMultibase` per the multibase prefix.

5. Confirm that the decoded key is exactly 32 bytes.

If any step fails, the reader treats the origin as having no resolvable
key. The reader MUST NOT apply any entry from the feed. The reader
SHOULD emit `did-unreachable` (for fetch failures), `did-malformed` (for
parse or structural failures), or `key-unresolvable` (for
verification-method or decoding failures) as appropriate.

## Key Rotation {#key-rotation}

A publisher rotates a key by publishing a new `verificationMethod` in
`did.json`. The publisher MAY retain the old verification method during
a transition window, allowing entries signed by the old key to continue
verifying.

The feed declares which key signed each entry by reference to a
verification method `id` via `<af:signer>` (see {{xml-namespace}}). A
single feed MAY contain entries signed by different keys; a reader MUST
verify each entry under the key referenced by that entry, not under a
single per-feed key.

A reader MUST NOT cache a public key beyond the freshness of the DID
document HTTP response. With no caching headers, the reader SHOULD
re-fetch on every feed poll. With `Cache-Control: max-age=N`, the
reader MAY cache the DID document and the keys derived from it for `N`
seconds. The interaction between feed cache freshness and DID document
cache freshness is independent: an entry MUST be verified under the
DID document the reader currently holds, regardless of how long ago the
feed body was fetched.

This protocol does not specify a key revocation mechanism beyond
publishing a new DID document and `feed-status: terminated`. Published
revocation is the only signal the protocol carries.

## Signature Algorithm {#sig-algorithm}

Signatures are detached Ed25519 per [RFC8032]. The signature is the
64-octet output of Ed25519 signing over the canonical payload bytes
defined in {{canonical-json}}, encoded for transport in the XML
envelope as base64url without padding per [RFC4648] Section 5.

This protocol does not define HMAC, hybrid signature schemes, JOSE
envelopes, JWS, or COSE wrappers. The signature is the raw 64 bytes,
base64url-encoded once, placed verbatim in `<af:sig>`.

## What Identity Binds, and What It Does Not {#identity-binds}

A signature in `<af:sig>` binds:

- the canonical payload bytes (defined in {{canonical-json}});

- to the holder of the private key whose public counterpart was at the
  origin's `did.json` at the moment the reader resolved it.

A signature in `<af:sig>` does NOT bind:

- the truth of the payload. The publisher MAY be lying; see
  {{security-lying}}.

- any legal identity. `did:web` ties a key to a hostname, not to an
  organization.

- continuity of the holder over time. A key may have been compromised
  or sold between two readings, and the protocol cannot tell.

- any property of the live API at the endpoint named in the payload.
  Only the publisher's assertion about the API is bound; the live API
  may behave differently.

The signed feed is forensic substrate. It is not ground truth. Treat it
as such throughout.

# Resources {#resources}

## Three Artifacts at Well-Known URIs {#three-artifacts}

A v0 publisher MUST publish three artifacts at well-known URIs per
[RFC8615]:

| URL                            | What                         | Cardinality              |
| ------------------------------ | ---------------------------- | ------------------------ |
| `/.well-known/did.json`        | identity (key)               | one current document     |
| `/.well-known/agent-card.json` | snapshot (current state)     | one current document     |
| `/.well-known/agent-feed.xml`  | stream (append-only history) | growing append-only Atom |

Identity is the subject of {{identity}}. Snapshot and stream are the
subject of this section.

## Why Snapshot and Stream Are Separate {#snapshot-vs-stream}

The snapshot at `/.well-known/agent-card.json` and the stream at
`/.well-known/agent-feed.xml` answer structurally different questions:

- The snapshot answers: "what is true now?"

- The stream answers: "what became true, and when?"

These questions have different time-constants, different consumers, and
different shapes. A reader cannot reconstruct the second from samples
of the first. If a publisher offered only a snapshot and a reader
polled it, the reader would observe a sequence of states `S0, S1, S2,
...`. When adjacent samples differ, the reader infers "something
changed between these polls", but:

- The reader does not know when the change happened, only that it
  happened inside the polling window.

- The reader does not know how. One event or several events collapsed
  by the snapshot are indistinguishable.

- The reader does not know the structural delta. There is no migration
  hint.

- Two readers polling at different phases reconstruct different
  histories of the same world.

- Readers who began polling after a change see no evidence the change
  happened.

For long-running agents whose operations span schema migrations, or
whose audit records must answer "what did the origin assert at the
moment my agent acted?", these properties are not optional. The stream
is the artifact that has them.

The snapshot retains its value: it answers "what is true now?" cheaply,
in one fetch, without replaying history. New readers, or readers that
do not need temporal precision, can use the snapshot alone. The two
artifacts are complementary, not redundant.

## The Snapshot Artifact {#snapshot-artifact}

The snapshot artifact at `/.well-known/agent-card.json` describes the
current state of the origin's machine-readable surface. The schema of
this artifact is NOT specified by this protocol. The publisher MAY use
MCP Server Cards [MCP], A2A Agent Cards [A2A], OpenAPI documents, or
any other capability description format.

The protocol DOES require:

- The snapshot MUST exist.

- The snapshot MUST be reachable over HTTPS at the well-known location.

- The snapshot MUST be consistent with the most recent applicable
  feed entry. If the feed asserts that the canonical A2A endpoint is
  `https://example.com/a2a/v1`, the snapshot MUST also assert it.
  Disagreement between snapshot and feed is a publisher bug; a reader
  encountering it is in the territory of {{disagreement}}.

A v0 reader MAY consult the snapshot for fields the feed does not
provide. A v0 reader MUST NOT use the snapshot to reconstruct historical
gaps; only the feed has historical authority.

## The Stream Artifact {#stream-artifact}

The stream artifact at `/.well-known/agent-feed.xml` is an Atom 1.0
document [RFC4287] extended with the namespace
`https://agent-feed.dev/ns/v0`, conventionally bound to the prefix
`af`. The structural details are specified in {{entry-types}} and
{{xml-namespace}}.

The stream MUST be append-only at the level of semantic content. The
multiset of (entry-id, canonical-payload, signature) tuples MUST grow
monotonically. The publisher MAY:

- re-emit the XML with different formatting, ordering, or whitespace
  in the envelope (the XML wrapper is not signed; see
  {{signature-scope}});

- archive older entries off-stream, removing them from the served
  document;

- adjust feed-level metadata (`<title>`, `<updated>` at the feed level,
  `af:feed-status`) without re-signing entries.

The publisher MUST NOT:

- reuse an entry's `<id>` for a different canonical payload (this
  triggers `replay-mismatch` per {{idempotency}});

- serve a stream that omits an entry it previously served AND serves a
  newer entry that depends on the omitted one. To keep the feed
  self-sufficient, the publisher SHOULD include enough prior entries
  that a fresh reader can establish state from the visible ones.

A previously-present `<id>` now absent is not a violation in itself;
it indicates archival. The reader MAY warn but MUST NOT treat it as
termination.

## What Does Not Belong in the Stream {#stream-nongoals}

The following do NOT belong in the v0 stream:

- operational status (incidents, outages, latency events);

- policy contracts (pricing, rate limits, ToS-for-agents);

- sybil claims, reputation, attestation;

- capability descriptions (those belong in the snapshot);

- marketing content.

Anything a reader cannot map to the contract in {{reader-contract}}
does not belong in the stream. Including any of the above would couple
unrelated time-constants and unrelated audiences into one artifact, and
would expand the blast radius of a key compromise into operational and
policy domains. See {{security}}.

# Entry Types {#entry-types}

A v0 feed defines exactly three entry types, identified by the
`af:type` element:

- `endpoint-announcement`
- `schema-change`
- `deprecation`

Each entry carries a JSON payload in the entry's `<content
type="application/json">` element, signed independently per
{{canonicalization}}. The three types have different time-constants,
different consumers, and different blast radii; they are kept distinct
deliberately.

## Common Entry Envelope {#entry-envelope}

Every v0 entry MUST contain:

- An Atom `<id>` element. Its value is a publisher-stable URI. The id
  MUST be unique within the feed and MUST be stable across re-emissions
  of the same logical event. Recommended convention:
  `urn:af:<origin-host>:<unix-millis>` or
  `urn:af:<origin-host>:<uuid>`. The reader uses this id for
  idempotency per {{idempotency}}.

- An Atom `<updated>` element. The value is an RFC 3339 [RFC3339]
  timestamp with `Z` timezone. This is the publisher's claim about
  when the fact became true, NOT when the entry was written. The
  reader records it for audit but MUST NOT use it for ordering (see
  {{on-receipt}}).

- An Atom `<title>` element. The title SHOULD equal the value of
  `af:type` for consistency. Readers MUST NOT depend on the title and
  MUST treat it as human-facing only.

- An `af:type` element. Its value is exactly one of:
  `endpoint-announcement`, `schema-change`, `deprecation`. Unknown
  values trigger {{unknown-types}} behavior.

- A `<content type="application/json">` element. Its text content is
  the canonical JSON form of the type-specific payload defined below,
  per {{canonical-json}}.

- An `<af:sig type="ed25519">` element. Its text content is the
  base64url-encoded detached Ed25519 signature over the bytes of the
  `<content>` element's text. See {{canonicalization}}.

- An optional `<af:signer>` element. Its value is the verification
  method `id` from `did.json` whose key signed this entry. If absent,
  the reader uses the first `Ed25519VerificationKey2020` per
  {{key-resolution}}.

The signature covers ONLY the canonical JSON payload bytes. It does
NOT cover the XML envelope, the title, the updated timestamp, the id,
or any other element of the surrounding entry or feed. If a publisher
needs a timestamp inside the signed bytes, the publisher places it
inside the JSON payload; several entry types do exactly this with
type-specific timestamp fields.

## endpoint-announcement {#entry-announcement}

The publisher asserts: for this origin, here is the canonical URL that
serves a given protocol, currently at this schema version.

This entry makes a feed self-bootstrapping. A reader joining a feed for
the first time can find the most recent `endpoint-announcement` for
each `(protocol, endpoint-id)` pair and learn the current canonical
surface without replaying the entire schema-change history.

### Payload fields {#payload-announcement}

- `endpoint-id` (string, REQUIRED): a stable identifier within the
  origin for this endpoint. MAY equal `endpoint`. Readers key state
  on `endpoint-id`. If absent, readers MUST treat `endpoint` as the
  `endpoint-id`.

- `endpoint` (string, REQUIRED): an absolute URL or a path-relative
  URL beginning with `/`. If path-relative, the reader resolves it
  against the origin URL.

- `protocol` (string, REQUIRED): the protocol name. Opaque to the
  protocol; conventional examples include `a2a`, `mcp`, `rest`,
  `graphql`. Convention: lowercase ASCII.

- `version` (string, REQUIRED): the schema version label. Opaque to
  the protocol. Convention: semver-shaped, but not enforced.

- `asserted-at` (string, REQUIRED): an RFC 3339 timestamp when this
  assertion took effect. This is the publisher's claim about effective
  time; the reader records it.

### Example payload {#example-announcement}

The payload, formatted for readability:

```json
{
  "asserted-at": "2026-04-27T12:00:00Z",
  "endpoint": "https://example.com/a2a/v1",
  "endpoint-id": "a2a",
  "protocol": "a2a",
  "version": "1.0"
}
```

The on-the-wire bytes embedded in `<content>` are the canonical form
per {{canonical-json}} -- sorted keys, no whitespace.

### Reader effect {#effect-announcement}

Upon application, the reader upserts the endpoint record for the key
`(a2a, a2a)` so that a subsequent call to
`reader.canonicalEndpoint(origin, "a2a")` returns
`https://example.com/a2a/v1`.

## schema-change {#entry-schema-change}

The publisher asserts: endpoint X moved from schema version A to
schema version B at the indicated moment, and here is the structural
delta describing the change.

### Payload fields {#payload-schema-change}

- `endpoint-id` (string, REQUIRED): the endpoint-id whose schema
  changed. SHOULD reference an endpoint previously announced via
  `endpoint-announcement`; if not, the reader synthesizes a record per
  {{apply-schema-change}}.

- `from-version` (string, REQUIRED): the schema version before this
  change. Opaque.

- `to-version` (string, REQUIRED): the schema version after this
  change. Opaque.

- `effective-at` (string, REQUIRED): an RFC 3339 timestamp when the
  new version began serving.

- `migration` (object, REQUIRED): a `migration-delta` describing the
  structural change. See {{migration-delta}}.

### Migration delta sub-language {#migration-delta}

The `migration` object MAY contain the following keys, each optional.
The keys defined in v0 are:

- `add` (array of strings): JSON Pointer [RFC6901] paths (without the
  leading `#`) added in `to-version`.

- `remove` (array of strings): JSON Pointer paths removed in
  `to-version`.

- `rename` (object): each key is the old JSON Pointer path; each value
  is the new JSON Pointer path.

- `retype` (object): each key is a JSON Pointer path; each value is
  an object `{ "from": <type-token>, "to": <type-token> }`. Type
  tokens are one of: `string`, `number`, `boolean`, `null`, `object`,
  `array`, or `nullable<T>` where T is a type token.

Future versions of this protocol MAY define additional migration delta
operators. A v0 reader that does not understand a key in the migration
delta MUST preserve that key in the recorded migration so that an agent
that does understand it can use it. The reader MUST NOT use unknown
keys for live-response disagreement detection per {{disagreement}}.

This is the conservative posture of {{unknown-types}} applied to the
migration delta sub-language: do not pretend to understand; record;
move on.

### Example payload {#example-schema-change}

```json
{
  "effective-at": "2026-04-27T13:00:00Z",
  "endpoint-id": "orders-api",
  "from-version": "1.0",
  "migration": {
    "add": ["/currency"],
    "rename": { "/amount": "/total" }
  },
  "to-version": "1.1"
}
```

### Reader effect {#effect-schema-change}

Upon application, the reader records the migration `1.0->1.1` for
`orders-api` and updates the endpoint's current version to `1.1`. After
this entry, the agent expects to see `/currency` and `/total` (not
`/amount`) in `orders-api` responses; the disagreement detection in
{{disagreement-mismatch}} fires if it does not.

## deprecation {#entry-deprecation}

The publisher asserts: endpoint X will be removed on date D. After D,
use Y instead, if Y is given.

### Payload fields {#payload-deprecation}

- `endpoint-id` (string, REQUIRED): the endpoint-id being deprecated.
  MUST reference an endpoint previously announced via
  `endpoint-announcement`; if unknown to the reader, the reader emits
  `deprecation-of-unknown` and ignores the entry's effects per
  {{apply-deprecation}}.

- `announced-at` (string, REQUIRED): an RFC 3339 timestamp when the
  deprecation was announced.

- `sunset` (string, REQUIRED): an RFC 3339 timestamp marking the
  moment the endpoint is no longer guaranteed to serve.

- `replacement` (string or null, OPTIONAL): the `endpoint-id` of the
  successor. Absent or null means no replacement is announced; the
  endpoint is dead from the sunset onward.

- `reason` (string or null, OPTIONAL): a freeform human-readable
  explanation. Readers MUST NOT condition behavior on `reason`. Readers
  MAY surface `reason` to agents for logging.

The `replacement` field references an `endpoint-id`, NOT a URL. The
reader resolves the URL via the most recent `endpoint-announcement`
for that id. This indirection lets the publisher move the replacement
URL later without re-issuing the deprecation.

### Example payload {#example-deprecation}

```json
{
  "announced-at": "2026-04-27T14:00:00Z",
  "endpoint-id": "orders-api-v1",
  "reason": "consolidating onto orders-api-v2",
  "replacement": "orders-api-v2",
  "sunset": "2026-10-01T00:00:00Z"
}
```

### Reader effect {#effect-deprecation}

Upon application, the reader marks `orders-api-v1` as deprecated with
sunset `2026-10-01T00:00:00Z` and replacement `orders-api-v2`. Until
the sunset, queries return the v1 URL. From the sunset onward, queries
return the URL currently associated with `orders-api-v2`, or no URL if
v2 was never announced.

## Why Exactly These Three {#why-three}

- `endpoint-announcement` is the ground truth: without it,
  `schema-change` and `deprecation` have nothing to reference.

- `schema-change` is the load-bearing use case. The protocol exists
  because schema changes break agents silently.

- `deprecation` is the long-form cousin of `schema-change`: it
  announces the future removal of a whole endpoint rather than the
  mutation of a field within an endpoint, and has a different
  time-shape (announcement now, effect later).

Status, policy, capability advertisement, sybil claims, and reputation
are not entry types in v0. Each has different time-constants,
different consumers, and different blast radii. Some belong in
different artifacts (snapshot, status page, policy document). Some
require a layer above v0. None belong here.

# Canonicalization and Signing {#canonicalization}

This section specifies how the bytes that get signed are produced from
a payload object, how a signature is produced, and how a reader
verifies it.

## What Gets Signed {#signature-scope}

The signature in `<af:sig>` covers exactly the bytes of the
`<content>` element's text content, which by {{canonical-json}} are the
canonical JSON encoding of the entry's payload object. The signature
covers nothing else.

The signature does NOT cover:

- the entry's `<id>` element;
- the entry's `<title>` element;
- the entry's `<updated>` element;
- the `<af:type>` element;
- the `<af:signer>` element (if present);
- the surrounding `<feed>` envelope, including `<feed>`-level
  `<id>`, `<title>`, `<updated>`, `af:spec-version`, and
  `af:feed-status`;
- any HTTP header;
- any XML attribute on the `<content>` element other than the text
  it contains.

The narrow scope is deliberate. It allows the publisher to:

- re-format the XML wrapper without re-signing entries;
- toggle `af:feed-status` between `active`, `terminated`, and
  `migrated` without re-signing entries (a kill switch is itself a
  state on the feed envelope, not on each entry);
- re-emit the document with a new feed-level `<updated>` without
  re-signing entries;
- move entries between archives without re-signing them.

The signature is bound to the fact (the JSON payload), not to the
transport (the XML envelope). A reader MUST verify by reconstructing
the canonical-payload bytes exactly as the publisher would have, then
running Ed25519-Verify per [RFC8032] over those bytes with the
appropriate public key from {{identity}}.

## Canonical JSON Encoding {#canonical-json}

The canonical JSON form of a payload object is the result of:

1. Sort all object keys recursively in lexicographic byte order
   (Unicode codepoint order, equivalently UTF-8 byte order for valid
   keys).

2. Serialize with no whitespace whatsoever: no spaces between tokens,
   no newlines, no tabs.

3. Use double-quoted strings with the standard JSON escape rules
   [RFC8259]. The minimum required escape set is: `\"`, `\\`, `\/`
   (optional), `\b`, `\f`, `\n`, `\r`, `\t`, and `\u<hex>` for
   control characters U+0000 through U+001F. Codepoints outside
   ASCII MUST be encoded directly as their UTF-8 byte sequence; they
   MUST NOT be escaped via `\u<hex>` in canonical output unless they
   are control characters.

4. Numbers MUST be finite. NaN, +Infinity, and -Infinity MUST NOT
   appear in canonical output; a publisher emitting any of these is
   publishing an invalid feed.

5. Numbers MUST be encoded such that decoding yields the same value.
   Integer values within IEEE 754 [IEEE-754] double-precision safe
   range (`-(2^53 - 1)` to `+(2^53 - 1)`) SHOULD be encoded with no
   decimal point and no exponent. Non-integer numbers SHOULD use
   shortest-round-trip decimal representation.

6. Booleans are exactly `true` and `false`. Null is exactly `null`.

7. Arrays preserve insertion order. Arrays are NOT sorted; only object
   keys are sorted.

8. The output is a UTF-8 byte sequence with no byte-order mark (BOM).

This encoding is a deliberate subset of the JSON Canonicalization
Scheme (JCS) [RFC8785]. v0 does not formally adopt JCS to keep the
implementation surface small, but a publisher MAY use a JCS
implementation that satisfies the rules above and produce conformant
output, and a reader implementing the rules above will accept JCS
output.

## Producing the Signature {#produce-sig}

Given the canonical payload bytes `P` (the UTF-8 bytes from
{{canonical-json}}) and the publisher's Ed25519 private key `K_priv`,
the signature is:

<CODE BEGINS>

sig = Ed25519-Sign(K_priv, P) // [RFC8032]

<CODE ENDS>

The 64-byte signature is encoded as base64url without padding per
[RFC4648] Section 5 and placed verbatim into the `<af:sig
type="ed25519">` element's text. The leading and trailing whitespace
in the XML element's text content (if any introduced by formatters)
MUST be ignored by readers when decoding the signature; the
publisher SHOULD avoid emitting it.

## Reader Verification {#reader-verify}

Given:

- the canonical payload bytes `P` (the UTF-8 bytes of the
  `<content>` element's text content as parsed);

- the base64url-decoded 64-byte signature `sig` from `<af:sig>`;

- the 32-byte public key `K_pub` resolved per {{key-resolution}}
  using the entry's `<af:signer>` value if present, or the default
  verification method otherwise;

verification is:

<CODE BEGINS>

ok = Ed25519-Verify(K_pub, P, sig) // [RFC8032]

<CODE ENDS>

If `ok` is true, the entry is verified. Otherwise, the entry is
unverified. There is no third state.

## What Canonicalization Is NOT For {#canon-not-for}

Canonical JSON in v0 is ONLY for signing. It is not the format the
agent uses to consume the payload. A reader parses the payload through
its standard JSON parser, on whatever bytes are in the document. Two
implementations may both be conformant readers and both observe the
same feed even if they sort their internal representations differently,
as long as each reconstructs the canonical bytes exactly when
verifying.

A publisher's canonical bytes are the only thing that must match
across producer and consumer for a given entry. A pretty-printed copy
of the same logical object, if it ever appeared in `<content>`, would
not verify; that is not a bug. That is the protocol working.

## XML Namespace {#xml-namespace}

The XML extension namespace for v0 is:

```
https://agent-feed.dev/ns/v0
```

It is conventionally bound to the prefix `af`. A reader MUST recognize
the namespace by its URI, NOT by its prefix; a publisher MAY use any
prefix, including the empty default.

The elements defined in this namespace are:

- `af:type` (in `<entry>`): one of the type tokens defined in
  {{entry-types}}.

- `af:sig` (in `<entry>`): the base64url-encoded detached signature.
  Carries the attribute `type="ed25519"` for v0.

- `af:signer` (in `<entry>`): optional; the verification method `id`
  from `did.json` whose key signed this entry.

- `af:spec-version` (in `<feed>`): the integer protocol version. For
  v0, the value is `0`.

- `af:feed-status` (in `<feed>`): one of `active`, `terminated`,
  `migrated`.

- `af:migrated-to` (in `<feed>`): present when `af:feed-status` is
  `migrated`. Its value is the new feed URL.

No other element in this namespace is meaningful in v0. Readers handle
unknown `af:` elements per {{unknown-types}} (skipped, surfaced, never
inventing semantics).

## Example Feed Document {#example-feed}

The following non-normative example illustrates the structural shape
of a v0 feed document. The signatures, timestamps, and key material are
illustrative only.

```xml
<?xml version="1.0" encoding="UTF-8"?>
<feed xmlns="http://www.w3.org/2005/Atom"
      xmlns:af="https://agent-feed.dev/ns/v0">
  <id>https://example.com/.well-known/agent-feed.xml</id>
  <title>example.com agent-feed</title>
  <updated>2026-04-27T14:00:00Z</updated>
  <af:spec-version>0</af:spec-version>
  <af:feed-status>active</af:feed-status>

  <entry>
    <id>urn:af:example.com:1745755200000</id>
    <updated>2026-04-27T12:00:00Z</updated>
    <title>endpoint-announcement</title>
    <af:type>endpoint-announcement</af:type>
    <content type="application/json">{"asserted-at":"2026-04-27T12:00:00Z","endpoint":"https://example.com/a2a/v1","endpoint-id":"a2a","protocol":"a2a","version":"1.0"}</content>
    <af:sig type="ed25519">RGV0YWNoZWRFZDI1NTE5U2lnbmF0dXJlR29lc0hlcmUuLi4=</af:sig>
  </entry>

  <entry>
    <id>urn:af:example.com:1745758800000</id>
    <updated>2026-04-27T13:00:00Z</updated>
    <title>schema-change</title>
    <af:type>schema-change</af:type>
    <content type="application/json">{"effective-at":"2026-04-27T13:00:00Z","endpoint-id":"orders-api","from-version":"1.0","migration":{"add":["/currency"],"rename":{"/amount":"/total"}},"to-version":"1.1"}</content>
    <af:sig type="ed25519">QW5vdGhlckRldGFjaGVkRWQyNTUxOVNpZ25hdHVyZS4uLg==</af:sig>
  </entry>

</feed>
```

# Versioning and Termination {#versioning}

This section specifies how a v0 reader handles feed-level metadata
that controls protocol-version compatibility and feed lifecycle.

## af:spec-version {#spec-version}

Every v0 feed MUST carry an `af:spec-version` element at the feed
level (a direct child of `<feed>`) whose integer value is `0`.

A v0 reader MUST accept any feed with `af:spec-version` of `0`. A
reader MAY accept feeds with higher integer values if it has been
extended to do so. A v0 reader encountering a feed with
`af:spec-version` greater than `0` MUST treat the feed as if it had
`af:feed-status: terminated` for the duration of the session, NOT
because the feed is in fact terminated, but because the reader cannot
vouch for any of its semantics.

This is forward-pessimism: a v0 reader does not know what a v1 entry
type means, what a v1 migration delta operator means, or what a v1
trust field means. It declines to guess. The forward path is for
readers to be upgraded; the protocol does not provide a fallback that
silently downgrades semantics.

A publisher migrating from v0 to a future version SHOULD continue to
serve a v0-compatible feed for an overlapping window, either at a
different URL or by emitting `af:feed-status: migrated` with
`af:migrated-to` (see {{feed-status-migrated}}). v0 readers can then
continue working until they upgrade.

## af:feed-status {#feed-status}

Every v0 feed MUST carry an `af:feed-status` element at the feed level
whose value is exactly one of:

- `active`
- `terminated`
- `migrated`

These are the only legal values. An unknown value is a v0 violation;
readers SHOULD treat it as `terminated`.

### active {#feed-status-active}

The publisher is currently asserting this feed. The reader proceeds
normally per {{reader-contract}}.

### terminated {#feed-status-terminated}

The publisher is revoking trust in this feed at this URL. As of the
moment a reader sees `terminated`, the per-origin trust flag becomes
`false` per {{reader-state}}. All applied state from this origin
ceases to influence future agent queries. The publisher is asserting,
in effect, "forget what I told you here."

A `terminated` feed MAY still contain `<entry>` elements; v0 readers
MUST NOT apply them. The publisher is permitted to continue serving
the document for forensic purposes. The feed is dead at the level of
agent trust; it is not necessarily dead at the level of the artifact.

A publisher SHOULD NOT toggle a feed back from `terminated` to
`active` in v0; doing so does not automatically restore reader trust.
Readers MAY require an out-of-band signal -- a human operator -- to
re-trust an origin after termination. This asymmetry is to prevent a
compromise followed by a quiet recovery from also quietly re-trusting
the compromised origin.

### migrated {#feed-status-migrated}

The publisher has moved to a new feed URL. When `af:feed-status` is
`migrated`, the feed MUST also contain an `af:migrated-to` element at
the feed level whose value is the new feed URL.

A reader observing `migrated`:

1. MUST treat the current feed URL as effectively `terminated` for
   trust purposes -- the per-origin trust flag at this URL becomes
   `false`.

2. SHOULD attempt to fetch the feed at the URL given in
   `af:migrated-to`.

3. MUST resolve identity afresh at the new URL. That is, a new DID
   document fetch under the DID that the new URL implies. The same
   key MAY sign at the new URL, but the new feed MUST be verified on
   its own terms.

4. MUST NOT carry the old feed's applied state forward implicitly. The
   new feed bootstraps state from its own entries.

A reader MAY refuse to follow `af:migrated-to` if the new URL is on a
different hostname under different DNS authority. That is a reader
policy decision, not a protocol mandate.

## The Kill Switch Contract {#kill-switch}

`feed-status: terminated` is the kill switch. It exists in v0 because:

- A compromised key or stolen domain is a real risk, and the protocol
  must give the publisher a way to tell readers "stop trusting me
  here."

- Without it, the only kill mechanism is "remove the file", which a
  reader cannot distinguish from a routine outage.

- A signed `terminated` document is itself a verifiable revocation: it
  asserts, "this revocation came from the same key that signed
  everything else; trust the revocation as you trusted the rest."

The kill switch is intentionally one-way at the protocol level. A
publisher that terminated by mistake does not get to un-terminate by
flipping the value back. Recovery requires an out-of-band conversation
with each reader operator and (typically) a key rotation and a fresh
start.

That asymmetry exists because the cost of a false-negative termination
(reader continues trusting a compromised origin) is far higher than
the cost of a false-positive termination (operators have to re-trust
a recovered origin manually). The protocol picks the side of safety
under uncertainty.

## Versioning of Internal Vocabularies {#vocab-versioning}

`af:spec-version` versions the protocol as a whole: entry types,
canonicalization rules, signing rules, kill-switch semantics. It does
NOT version:

- the publisher's own schema versions, which appear inside payloads
  (e.g. `version`, `from-version`, `to-version`) and are opaque to
  this protocol;

- the migration-delta sub-language inside `schema-change`, which is
  handled by the conservative posture of {{migration-delta}}: readers
  preserve unknown keys but do not use them;

- the DID method or signature algorithm. v0 is fixed at `did:web` and
  Ed25519. A future spec version MAY permit alternatives.

When a future version of this protocol ships, it will carry a new
integer value of `af:spec-version`. A reader supporting both versions
detects which to apply by the integer. There is no negotiation, no
content-type dance, no probe sequence. The number is the contract.

# Security Considerations {#security}

This section enumerates threats relevant to v0, what the protocol
mitigates, and what it explicitly does not.

## Signature Scope and What It Proves {#sec-sig-scope}

A v0 signature proves origin: the bytes of an entry's canonical JSON
payload were signed by the holder of the private key whose public
counterpart was at `did.json` at the moment the reader resolved it.

A v0 signature does NOT prove truth. The publisher MAY assert a false
schema-change (a field name that does not exist), a stale one (the
schema reverted but no new entry was published), or a malicious one
(a publisher who wishes to confuse a competitor's agents). The
detection of such lies is outside the protocol; see
{{sec-lying-publisher}}.

A v0 signature does NOT prove continuity of the holder. A key may have
been compromised or transferred. The protocol cannot tell.

A v0 signature does NOT prove any property of the live API. Live
behavior may differ from the announced behavior; the reader's
disagreement detection in {{disagreement}} surfaces this, but the
agent's policy decides what to do with the surface.

## Lying Publisher {#sec-lying-publisher}

A signed feed entry binds bytes to origin, not to truth. A
sufficiently motivated publisher can sign:

- a stale schema-change ("I changed the schema back, but I haven't
  updated the feed");

- a wrong one ("I think the new field is `currency` but it is in fact
  `cur`");

- a deliberately misleading one ("I will sign nothing about my recent
  breaking change in order to keep dependents broken").

The protocol does not detect any of these. Detection requires
cross-referencing live behavior against announced behavior across many
readers and possibly many publishers, which is a layer above this
protocol. The disagreement event in {{disagreement-mismatch}} is the
substrate on which detection can be built; it is not detection itself.

A reader observing repeated mismatches against a single publisher has
the data to escalate -- to a human, to an aggregator, to a reputation
service. The action is not specified by this protocol. v0 ships the
substrate; detection lives above v0.

## Sybil Resistance {#sec-sybil}

This protocol binds identity to DNS through `did:web`. An adversary
who controls a domain controls its feed. An adversary who controls
many domains controls many feeds. The protocol does not pretend
otherwise.

Sybil resistance -- making it costly to be many indistinguishable
publishers -- is a different problem with different primitives
(proof-of-work, stake, attestation, social graph). It is addressed by
ecosystems built on top of this protocol, not within this protocol.

A reader MUST NOT depend on signature verification under this protocol
for sybil resistance. Two distinct domains both serving valid `did.json`
documents are, from this protocol's standpoint, two distinct
publishers. Whether they are operated by the same human, organization,
or attacker is not knowable from the protocol alone.

## Replay and Idempotency {#sec-replay}

An adversary serving a copy of the publisher's feed (for example, a
caching CDN under their control, or an in-path proxy) cannot forge
entries because Ed25519 signatures are bound to the canonical payload
bytes. The adversary CAN, however:

- replay entries that were once valid but have since been logically
  superseded;

- delay delivery of newer entries to specific readers;

- omit entries entirely, allowing readers to fall behind without
  signaling.

The reader's idempotency contract per {{idempotency}} mitigates
replay-of-old-entries: an `<id>` whose canonical payload matches
prior application is silently skipped, and an `<id>` whose payload
differs triggers `replay-mismatch`. The protocol does not mitigate
selective omission or delay; mitigation requires either a push transport
with delivery acknowledgments (deferred to a future version) or
out-of-band cross-checking among readers.

## Key Compromise and Rotation {#sec-key-compromise}

If a publisher's private key is compromised, an attacker can sign
entries that verify under the published verification method. The
publisher's mitigations within v0 are:

- publish a new `verificationMethod` in `did.json` (rotation per
  {{key-rotation}});

- emit `af:feed-status: terminated` to revoke trust in the feed under
  the compromised key (per {{kill-switch}}).

v0 acknowledges that the rotation ceremony is minimal. The protocol
does not specify:

- a key revocation list separate from `feed-status`;

- a delegation hierarchy by which a parent key can revoke a child key;

- a notarization or transparency log binding the publication time of
  a public key to a wider trust system.

Future versions of this protocol may address these. v0 readers
mitigate by re-resolving the DID document on each ingestion (per
{{key-rotation}}), so a compromised key removed from `did.json` stops
verifying further reads on the next poll.

A reader MUST NOT cache a public key past the freshness window
indicated by the DID document HTTP response. A publisher in the middle
of a rotation SHOULD set a short `Cache-Control: max-age` on
`did.json` for the duration of the transition, to bound the window in
which stale keys verify.

## Privacy and Public Visibility {#sec-privacy}

Feed entries are PUBLIC. They are integrity-protected (signed) but not
confidentiality-protected. Anyone who can fetch
`/.well-known/agent-feed.xml` can read every entry.

Origins operating private or internal-only agent surfaces MUST NOT
publish feed entries describing them under this protocol. The protocol
deployment surface is the public web. Selective disclosure is a
different problem with different primitives (capability tokens,
encrypted payloads, separate confidentiality channels) and is not in
scope.

A publisher publishing a feed implicitly accepts that:

- the feed will be archived by third parties;

- entries will be readable indefinitely once published, even after a
  feed-level termination;

- the feed's contents are part of a public record about the origin's
  surface.

A publisher who needs to retract a public assertion can publish a
follow-up entry that supersedes it, but the original signed entry
remains in archives forever. The protocol cannot retroactively
unpublish a signed fact.

## Polling Load on Origins {#sec-polling-load}

A naive deployment in which N readers poll an origin's feed with high
frequency creates load proportional to N. This protocol mitigates by:

- specifying a 60-second floor on poll frequency per {{polling}};

- specifying a 24-hour ceiling so that aggressively long cache
  windows do not create starvation;

- requiring readers to honor `Cache-Control` and `ETag` within those
  bounds, so a publisher serving `max-age=600` (ten minutes) limits
  reader poll-throughput accordingly;

- reading from a static file behind a CDN, which absorbs nearly all
  the load for typical deployments.

Origins without CDN access at scale will need to raise their cache
ceilings or move to a future push transport when one is defined.
Readers MUST NOT use this protocol's poll endpoint as a heartbeat or
liveness check; the cadence rules are bounds on legitimate use, not
permissions for arbitrary use.

A publisher experiencing abuse SHOULD:

- return HTTP 429 (`Too Many Requests`) with appropriate retry
  headers per [RFC9110];

- consider IP-level or token-level rate limiting outside the protocol
  scope.

A reader receiving 429 responses MUST respect the response, MUST NOT
retry sooner than the response indicates, and SHOULD raise an event
for operator visibility. Retry storms following 429 are out of
specification.

## Snapshot/Stream Disagreement {#sec-snapshot-disagreement}

If the snapshot at `/.well-known/agent-card.json` disagrees with the
most recent applicable feed entry (for example, the feed asserts a new
canonical URL but the snapshot still points to the old one), the
inconsistency is a publisher bug per {{snapshot-artifact}}. From the
reader's standpoint, the feed is authoritative for the temporal
record, and disagreement is a hint that the snapshot is stale.

A reader MAY surface a `snapshot-feed-disagreement` event for operator
visibility. The reader MUST NOT silently pick the snapshot's value
over the feed's value -- the feed is the temporal source of truth.
Silent reconciliation hides the publisher bug.

## DID Document Tampering on Resolution {#sec-did-tamper}

The DID document is fetched over HTTPS. The protocol relies on
HTTPS for resolution integrity. An adversary capable of intercepting
or rewriting the DID document at fetch time can substitute a
verification method whose key the adversary controls; they can then
sign entries that verify under that method.

Mitigations:

- HTTPS certificate validation MUST succeed against the origin's
  hostname; a reader MUST NOT accept invalid or self-signed
  certificates as if they were valid.

- Operators concerned about DNS hijacking SHOULD pin DNS resolution
  through DNSSEC and SHOULD subscribe to certificate transparency log
  monitoring for their hostnames. These mitigations are out of scope
  but are noted because `did:web` deliberately relies on the existing
  web PKI and DNS infrastructure.

## Threat Model Boundary {#sec-threat-boundary}

This protocol's threat model is bounded as follows:

- IN scope: a passive network observer; an active man-in-the-middle
  defeated by HTTPS; an adversarial publisher within the bounds of
  signature integrity (i.e., publishing false-but-signed entries);
  replay of stale entries; selective omission of newer entries from
  individual readers.

- OUT of scope: compromise of the publisher's signing key (mitigated
  only by rotation and termination); domain takeover (the protocol
  does not detect that the holder of the domain has changed);
  compromise of the underlying TLS/PKI/DNS infrastructure; sybil
  attacks; reputation systems; lying-but-signed publishers; agent-
  level decisions about how to react to mismatch events.

Implementers SHOULD make clear in their documentation which of these
threats are mitigated by their stack and which are not, and operators
SHOULD compose this protocol with whatever additional mitigations are
appropriate for their context.

# IANA Considerations {#iana}

This document requests IANA registration of two well-known URI suffixes
per [RFC8615].

## Well-Known URI: agent-feed.xml {#iana-agent-feed}

URI suffix:
: agent-feed.xml

Change controller:
: IETF

Specification document(s):
: This document.

Related information:
: The artifact is an Atom 1.0 [RFC4287] document extended with the
namespace `https://agent-feed.dev/ns/v0`. Content-type
`application/atom+xml`. The document is the append-only stream
artifact described in {{stream-artifact}}.

## Well-Known URI: agent-card.json {#iana-agent-card}

URI suffix:
: agent-card.json

Change controller:
: IETF

Specification document(s):
: This document.

Related information:
: The artifact is a JSON [RFC8259] document. Content-type
`application/json`. The schema of the document is not specified by
this protocol; the document is the snapshot artifact described in
{{snapshot-artifact}} and is constrained only by consistency with
the most recent applicable feed entry.

## Well-Known URI: did.json (informative) {#iana-did}

The `did.json` well-known URI is registered under [W3C-DID-WEB] and
is not requested again here. This document references the existing
registration.

## Media Types {#iana-media-types}

This document does not request a new media type. The feed is served
as `application/atom+xml`. The DID document and snapshot are served
as `application/json`.

## XML Namespace {#iana-xml-namespace}

This document defines an XML namespace for use in extending Atom feeds:

URI:
: `https://agent-feed.dev/ns/v0`

Registrant Contact:
: A. Abdi (abdullahiabdi1233@gmail.com)

XML:
: See {{xml-namespace}} for the elements defined in this namespace.

# References

## Normative References

[RFC2119]
: Bradner, S., "Key words for use in RFCs to Indicate Requirement
Levels", BCP 14, RFC 2119, March 1997,
<https://www.rfc-editor.org/info/rfc2119>.

[RFC3339]
: Klyne, G. and C. Newman, "Date and Time on the Internet:
Timestamps", RFC 3339, July 2002,
<https://www.rfc-editor.org/info/rfc3339>.

[RFC4287]
: Nottingham, M. and R. Sayre, Eds., "The Atom Syndication Format",
RFC 4287, December 2005,
<https://www.rfc-editor.org/info/rfc4287>.

[RFC4648]
: Josefsson, S., "The Base16, Base32, and Base64 Data Encodings",
RFC 4648, October 2006,
<https://www.rfc-editor.org/info/rfc4648>.

[RFC6454]
: Barth, A., "The Web Origin Concept", RFC 6454, December 2011,
<https://www.rfc-editor.org/info/rfc6454>.

[RFC6901]
: Bryan, P., Ed., Zyp, K., and M. Nottingham, Ed., "JavaScript Object
Notation (JSON) Pointer", RFC 6901, April 2013,
<https://www.rfc-editor.org/info/rfc6901>.

[RFC8032]
: Josefsson, S. and I. Liusvaara, "Edwards-Curve Digital Signature
Algorithm (EdDSA)", RFC 8032, January 2017,
<https://www.rfc-editor.org/info/rfc8032>.

[RFC8174]
: Leiba, B., "Ambiguity of Uppercase vs Lowercase in RFC 2119 Key
Words", BCP 14, RFC 8174, May 2017,
<https://www.rfc-editor.org/info/rfc8174>.

[RFC8615]
: Nottingham, M., "Well-Known Uniform Resource Identifiers (URIs)",
RFC 8615, May 2019,
<https://www.rfc-editor.org/info/rfc8615>.

[RFC9110]
: Fielding, R., Ed., Nottingham, M., Ed., and J. Reschke, Ed.,
"HTTP Semantics", STD 97, RFC 9110, June 2022,
<https://www.rfc-editor.org/info/rfc9110>.

[W3C-DID]
: Sporny, M., Longley, D., Sabadello, M., Reed, D., Steele, O., and
C. Allen, "Decentralized Identifiers (DIDs) v1.0", W3C
Recommendation, 19 July 2022,
<https://www.w3.org/TR/did-core/>.

[W3C-DID-WEB]
: Terbu, O., Ed., Sabadello, M., Ed., et al., "did:web Method
Specification", W3C Community Draft,
<https://w3c-ccg.github.io/did-method-web/>.

## Informative References

[RFC8259]
: Bray, T., Ed., "The JavaScript Object Notation (JSON) Data
Interchange Format", STD 90, RFC 8259, December 2017,
<https://www.rfc-editor.org/info/rfc8259>.

[RFC8785]
: Rundgren, A., Jordan, B., and S. Erdtman, "JSON Canonicalization
Scheme (JCS)", RFC 8785, June 2020,
<https://www.rfc-editor.org/info/rfc8785>.

[IEEE-754]
: IEEE, "IEEE Standard for Floating-Point Arithmetic", IEEE 754-2019,
July 2019.

[MCP]
: Anthropic, "Model Context Protocol", 2024,
<https://modelcontextprotocol.io/>.

[A2A]
: Google, "Agent2Agent (A2A) Protocol", 2025,
<https://google.github.io/A2A/>.

[ANP]
: "Agent Network Protocol", 2025,
<https://agent-network-protocol.com/>.

[ERC-8004]
: Ethereum, "ERC-8004: Trustless Agents", Ethereum Improvement
Proposal, 2025.

[WEBSUB]
: Genestoux, J. and A. Parecki, "WebSub", W3C Recommendation,
23 January 2018, <https://www.w3.org/TR/websub/>.

# Acknowledgements

{:numbered="false"}

The author thanks the participants in the design roundtable that
shaped this work: Paul Graham, John Carmack, Nassim Nicholas Taleb,
and Rich Hickey, whose scrutiny over multiple rounds tightened the
contract surface and the threat model. Specific contributions include
Hickey's argument for placing the reader contract before the producer
schema, Carmack's pressure on signature scope and what the bytes
actually cover, Taleb's framing of the kill switch and asymmetric
recovery cost, and Graham's pressure on bootstrapping order and the
question of who commits first in a federation protocol.

The author thanks the broader IETF and W3C communities for the
primitives this document composes: Atom, well-known URIs, Ed25519,
JSON Pointer, JSON canonicalization, and the DID core and `did:web`
work. None of the components in this document are novel; the
composition is.

# Author's Address

{:numbered="false"}

Abdullahi Abdi
:
Independent
:
Email: abdullahiabdi1233@gmail.com

# Appendix A: Conformance Categories {#appendix-conformance}

This appendix is non-normative. The conformance obligations are
distributed across the body of the document; this appendix gathers
them by implementation category for convenience.

## A.1 Publisher Conformance {#publisher-conformance}

A conformant publisher:

- MUST publish `did.json` at `/.well-known/did.json` over HTTPS, with
  fields per {{did-fields}}.

- MUST publish a feed at `/.well-known/agent-feed.xml` whose top-level
  element is the Atom `<feed>` element with the `agent-feed` namespace
  declared per {{xml-namespace}}.

- MUST include `af:spec-version` (value `0` for v0) and
  `af:feed-status` at the feed level per {{versioning}}.

- MUST emit each entry with `<id>`, `<updated>`, `<title>`,
  `af:type`, `<content type="application/json">`, and
  `<af:sig type="ed25519">` per {{entry-envelope}}.

- MUST sign each entry's `<content>` text bytes per
  {{canonicalization}}.

- MUST canonicalize JSON per {{canonical-json}} before signing.

- MUST keep `af:type` values within the v0 vocabulary per
  {{entry-types}}.

- MUST keep entry `<id>` values stable across re-emissions of the same
  semantic event per {{idempotency}}.

- MUST NOT reuse an entry `<id>` for a different canonicalized payload
  per {{stream-artifact}}.

- MUST publish a snapshot at `/.well-known/agent-card.json` consistent
  with the most recent applicable feed entries per
  {{snapshot-artifact}}.

- SHOULD use HTTPS with valid certificates that match the origin's
  hostname.

- SHOULD set sensible `Cache-Control` headers on the feed and the DID
  document.

- SHOULD serve content-type `application/atom+xml` for the feed.

- SHOULD serve content-type `application/json` for `did.json` and
  `agent-card.json`.

- MAY archive older entries off-stream once they are no longer needed
  to reconstruct current state from a fresh reader join, subject to
  the dependency rules in {{stream-artifact}}.

- MUST emit `af:feed-status: terminated` (or `migrated` with
  `af:migrated-to`) when revoking trust in the current feed per
  {{kill-switch}}.

## A.2 Reader Conformance {#reader-conformance}

A conformant reader:

- MUST resolve `/.well-known/did.json` per {{key-resolution}} before
  applying any entry from a feed.

- MUST verify each entry's signature per {{reader-verify}} before
  applying it.

- MUST NOT apply unverified entries per {{unverified}}.

- MUST handle unknown entry types per {{unknown-types}}: skip and
  surface, never invent semantics.

- MUST apply verified entries in document order per {{on-receipt}}.

- MUST honor `af:feed-status: terminated` by setting the per-origin
  trust flag to `false` and ceasing to use applied state for that
  origin per {{feed-status-terminated}}.

- MUST handle `af:feed-status: migrated` by treating the current URL
  as terminated and SHOULD follow `af:migrated-to` per
  {{feed-status-migrated}}.

- MUST emit a `mismatch` event for live-vs-feed disagreements per
  {{disagreement-mismatch}}; MUST NOT silently coerce.

- MUST be idempotent on re-ingestion by entry id per {{idempotency}}.

- MUST respect polling cadence bounds per {{polling}}.

- MUST NOT cache public keys past DID document freshness per
  {{key-rotation}}.

- SHOULD support each entry type's reader effect as specified in
  {{apply-by-type}}.

- SHOULD rate-limit `unverified-entry` and `unknown-entry-type` events
  per {{unverified}} and {{unknown-types}}.

- MAY consult the snapshot at `/.well-known/agent-card.json` for
  fields the feed does not provide per {{snapshot-artifact}}; MUST
  NOT use the snapshot for historical reconstruction.

## A.3 Test Categories {#conformance-tests}

Implementations seeking to claim conformance SHOULD pass tests in
each of the following categories. The categories are normative; the
specific tests are documented with reference implementations.

1. Canonicalization. Identical JSON inputs in different surface forms
   produce identical canonical bytes. Non-finite numbers are rejected
   on emission.

2. Signing roundtrip. Sign-then-verify against the same key succeeds.
   Verify against a different key fails. Verify against a tampered
   payload fails. Verify against a tampered signature fails.

3. DID resolution. A published `did.json` is fetched, the verification
   method is located by id (or by default if no `<af:signer>`), the
   public key is decoded, and a feed entry signed by the matching
   private key verifies. A feed entry signed by an unrelated key does
   not verify.

4. Entry application.
   - `endpoint-announcement` records and overwrites prior
     announcements for the same `(protocol, endpoint-id)`.

   - `schema-change` records migrations and updates the current
     version. A schema-change of an unknown endpoint synthesizes a
     record.

   - `deprecation` is honored before and after sunset; replacement
     resolves to the latest endpoint-announcement for that id.

5. Disagreement detection. The mismatch event fires when the live
   response lacks an announced added field and does not fire when the
   announced added field is present. Retype-mismatch fires per
   {{disagreement-mismatch}}.

6. Forward compatibility.
   - Unknown entry types are skipped, not applied, not failed.

   - Unknown migration-delta keys are preserved in recorded migrations
     but not used for {{disagreement}} detection.

   - A future `af:spec-version` integer causes a v0 reader to back off
     per {{spec-version}}.

7. Kill switch.
   - `feed-status: terminated` causes the per-origin trust flag to
     become `false`, and applied state stops influencing queries.

   - Toggling back to `active` does not re-trust automatically.

   - `feed-status: migrated` with `af:migrated-to` causes the reader
     to follow per its policy, and the new feed bootstraps fresh
     identity and state.

8. Idempotency.
   - Re-fetching a feed without changes applies nothing new and emits
     no events.

   - A reused entry `<id>` with a new payload triggers
     `replay-mismatch` and is not applied.

A reference test suite is published alongside the reference
implementation. Implementations claiming conformance SHOULD reference
the version of the suite they pass against.

## A.4 What Conformance Does Not Certify {#conformance-non-claims}

Passing the v0 conformance categories does NOT certify:

- security against any threat model beyond what {{identity}} binds;

- interoperability with any specific MCP, A2A, or other consumer
  surface;

- correct behavior under load, network partition, or adversarial
  publishers beyond the threat model in {{sec-threat-boundary}};

- agent-level decisions about what to do with a `mismatch` event.
  The protocol specifies the report; agent policy specifies the
  response.

Conformance is a narrow claim. It is not a seal of robustness.

# Appendix B: Glossary {#appendix-glossary}

This appendix is non-normative.

Active feed:
: A feed whose `af:feed-status` is `active`. Reader proceeds normally.

Agent:
: A program acting on behalf of a principal that consumes agent-feed
entries to maintain a model of an origin's machine-readable surface.

Append-only:
: A property of the stream per {{stream-artifact}}: the multiset of
(entry-id, canonical-payload, signature) tuples grows monotonically
and never shrinks.

Canonical JSON:
: The deterministic byte-encoding defined by {{canonical-json}}.

Detached signature:
: Signed bytes and signature transported separately. The v0 `<af:sig>`
is a detached Ed25519 signature over the canonical payload bytes.

Document order:
: The order in which entries appear in the parsed XML feed document.
See {{on-receipt}}.

Endpoint:
: A URL serving a particular protocol surface for an origin.

Endpoint-id:
: A stable identifier within an origin for an endpoint, used as the
cross-entry key. May or may not equal the URL.

Entry:
: An Atom `<entry>` element carrying one v0 fact, signed
independently per {{canonicalization}}.

Feed:
: The stream artifact at `/.well-known/agent-feed.xml`.

Migrated feed:
: A feed whose `af:feed-status` is `migrated`. Treat as terminated
for trust at the present URL and follow `af:migrated-to` per
{{feed-status-migrated}}.

Origin:
: An (HTTPS scheme, host, port) triple per [RFC6454], inferred here
from the URL where `did.json` is served.

Publisher:
: The party operating an origin and signing its feed.

Reader:
: The library or service that ingests feeds on behalf of an agent and
exposes the contract in {{reader-contract}}.

Snapshot artifact:
: The current-state document at `/.well-known/agent-card.json`. The
schema is not specified by this protocol; existence and consistency
are.

Stream artifact:
: The append-only feed at `/.well-known/agent-feed.xml`.

Terminated feed:
: A feed whose `af:feed-status` is `terminated`. Per-origin trust flag
becomes `false` per {{feed-status-terminated}}.

Verified entry:
: An entry whose detached signature successfully validates under the
resolved DID public key against the canonical payload bytes.

# Appendix C: Design Rationale {#appendix-rationale}

This appendix is non-normative. It records the load-bearing design
choices and the tensions they were chosen against, so future revisions
of this protocol know what they are reconsidering, not just that they
are.

## C.1 Reader Contract Before Producer Schema {#rationale-reader-first}

The conventional ordering of a protocol document is to specify the
wire format first and the consumer behavior second. This document
inverts the order. The reader's behavioral contract in
{{reader-contract}} appears before the producer schema in
{{entry-types}} because the contract surface for this protocol is the
reader, not the wire.

A producer can change the wire format substantially -- adding
elements, reordering attributes, changing whitespace within Atom -- and
a conformant reader will continue to behave correctly so long as the
canonical payload bytes verify. A producer cannot change reader
behavior by changing the schema. The schema is a vehicle; the contract
is the cargo.

Putting the reader contract first also forces the producer schema
into a derivative role. A field that the reader does not consume is
not a field; if it were, the contract would have specified a behavior
for it. This discipline keeps the producer schema small.

## C.2 Snapshot and Stream as Distinct Artifacts {#rationale-two-artifacts}

The snapshot at `/.well-known/agent-card.json` and the stream at
`/.well-known/agent-feed.xml` could in principle be combined: a single
artifact carrying current state and a tail of recent changes. They are
not combined for several reasons.

First, the artifacts have different time-constants. The snapshot
changes whenever any field in the origin's surface changes; the
stream changes when a discrete event the publisher chooses to
announce occurs. Combining them would force one rate of change on
both, mismatching one of them.

Second, the artifacts have different consumers. A reader that cares
only about "what does the origin look like right now?" is satisfied by
the snapshot in one fetch. A reader that cares about "when did the
origin assert each thing?" is satisfied only by the stream. Combining
them forces every consumer to pay the cost of the larger artifact.

Third, history cannot be reconstructed from samples. A polled
snapshot's adjacent samples can disagree, but disagreement does not
encode timing, count of events, or structural delta. The stream
encodes all three.

The cost of two artifacts is publisher discipline: the publisher must
keep them consistent. The protocol specifies that consistency is
required ({{snapshot-artifact}}) and that the feed is authoritative on
disagreement ({{sec-snapshot-disagreement}}).

## C.3 Atom Over a Custom Format {#rationale-atom}

The stream artifact is an Atom 1.0 document because Atom has been
deployed at web scale for two decades, has well-understood
extensibility via XML namespaces, has an `<id>`/`<updated>` semantics
that match the v0 entry contract closely, and has tooling in every
language that matters. A custom format would have to re-derive each
of those properties.

The cost of using Atom is XML overhead and the slight awkwardness of
embedding canonical JSON inside an XML text node. Both are accepted
trade-offs against the cost of inventing a new format.

## C.4 Detached Ed25519 Over an Envelope Format {#rationale-detached-ed25519}

The signature is detached, raw 64-byte Ed25519 [RFC8032], not wrapped
in JOSE [RFC7515], JWS, or COSE. This choice has three motivations:

- Algorithm simplicity. Ed25519 has a fixed 32-byte public key and
  fixed 64-byte signature. There is no algorithm negotiation, no
  parameter set, no curve selection.

- Implementation simplicity. A detached signature is the minimum
  information needed to verify integrity; the envelope is transport
  metadata. By keeping them separate, the signature can verify across
  envelope changes (re-emission, archive, reformat).

- Scope clarity. Detached signatures make the signature scope
  obvious: the bytes signed are precisely the bytes you point at, and
  nothing else. JWS-style envelopes blur this with header inclusion
  rules.

The cost of bypassing JOSE is that v0 cannot tunnel through systems
that expect JWS. v0 accepts that cost. JWS support, if useful, can be
added in a future version as an alternative encoding without
disturbing the signature semantics.

## C.5 did:web Over Other DID Methods {#rationale-did-web}

`did:web` was chosen over more elaborate DID methods (such as
`did:key`, `did:ion`, blockchain-rooted methods, or PKI-rooted
methods) because:

- It binds identity to DNS, the trust system the public web already
  uses.

- It requires no additional infrastructure beyond an HTTPS-served
  static file.

- It is unambiguous: there is exactly one DID per host, fetched at one
  URL.

- It is debuggable: the document is human-readable JSON.

The cost is that `did:web` inherits the limitations of DNS and PKI:
domain takeover compromises identity; DNS hijacking compromises
resolution; certificate authority compromise compromises HTTPS. v0
accepts these costs because the alternative (introducing a new trust
root) is significantly more expensive to deploy and to verify
independently.

`did:web` is also intentionally non-portable across hostnames. An
origin that changes hostname must publish a new feed at a new
location; the kill switch and `migrated` mechanism in {{versioning}}
exist to support this.

## C.6 Polling Over Push {#rationale-polling}

v0 is poll-only. WebSub [WEBSUB] is the mature standard for Atom
push and is acknowledged as a future extension in {{security}}. v0
defers it for two reasons:

- Polling is the simpler-to-deploy half. A static file behind a CDN
  is sufficient infrastructure for a publisher; WebSub adds a hub
  dependency that is harder to make universal.

- Polling has a single concurrency story. Push delivery requires
  retry semantics, idempotency at the delivery layer, and
  authentication of the hub-to-subscriber channel. Each of these is a
  source of complexity that v0 does not need.

The cost of poll-only is that readers cannot observe events at the
moment they are published; they observe events when they next poll.
Two readers polling at different phases observe the same event at
different times. v0 accepts that. A future extension MAY add push
delivery as opt-in, with conformance for both modes.

## C.7 Three Entry Types, Not Five or Ten {#rationale-three-types}

v0 defines exactly three entry types because each was demanded by a
concrete consumer behavior in {{reader-contract}} and no fourth was.
A protocol with too many entry types fragments reader implementation
and makes the conformance surface ill-defined; a protocol with too
few cannot express the events of interest.

The shortlist that did not make v0: status entries (operational
telemetry), policy entries (pricing, rate limits), capability
entries (which would duplicate the snapshot), sybil entries
(attestation), reputation entries. Each was excluded for the reasons
in {{stream-nongoals}}, summarized as: different time-constants,
different consumers, different blast radii.

Future versions may add entry types if and when concrete consumer
behaviors demand them. The bar is the same: a new entry type must be
supported by a documented reader behavior, not a producer convenience.

## C.8 Termination as One-Way at the Protocol Level {#rationale-one-way-termination}

The kill switch in {{kill-switch}} is intentionally one-way. A
publisher that has emitted `feed-status: terminated` cannot, within
the protocol, restore reader trust by toggling back to `active`. This
seems heavy; it is heavy on purpose.

Cost-asymmetry analysis: the worst case for "a recovered origin
must be re-trusted by hand" is operator inconvenience, scaling with
the number of readers. The worst case for "a compromised origin can
quietly recover trust by toggling a flag" is silent persistence of
compromise. The first is a coordination cost; the second is a
security failure. The protocol picks the side of safety.

This choice forecloses one feature (cheap recovery) to keep the
guarantee on the other side (visible recovery). Future versions may
add a notarized recovery mechanism if and when it can be defined
without weakening the asymmetry.

## C.9 No Registry, No Aggregator, No Discovery {#rationale-federation}

v0 is a federation specification. Every origin publishes for itself.
Every reader fetches what it cares about. There is no central index,
no aggregator endorsed by the protocol, no discovery layer that
identifies which origins exist.

This omission is deliberate. A registry would become a centralization
point: a thing to compromise, to capture, to gate. The protocol's
trust root is DNS; the protocol's discovery is whatever the reader
already knows about which origins matter. Building an aggregator on
top of v0 is permitted and likely useful; specifying one in the
protocol would add a different trust dependency that v0 does not
need.

The cost is that readers must come to v0 with a list of origins.
Bootstrapping a reader requires either operator configuration or
external discovery. v0 accepts that cost.

## C.10 Multi-domain Delegation Deferred {#rationale-multidomain}

A single legal entity often operates across many domains
(`shopify.com`, `myshopify.com`, `shop.app`, customer-bound
subdomains). It would be useful for one entity to publish one feed
authoritative across all its domains. v0 does not support this.

Cross-origin delegation requires a hierarchy of keys and a
delegation method that this protocol does not specify. Adding it to
v0 would require committing to a delegation primitive (key parent,
DID controller chains, or federated trust roots) that has known
trade-offs and ongoing standardization work in adjacent communities.
v0 declines to commit. An operator running N domains in v0 publishes
N feeds.

A future version of this protocol may add cross-domain delegation
when the delegation primitive is settled. Until then, the federation
unit is the origin.

# Appendix D: Implementation Notes {#appendix-implementation}

This appendix is non-normative.

## D.1 Reader State Sketch

A minimal reader's state for a single origin can be represented as:

<CODE BEGINS>

origin-state {
origin: URL,
trust: boolean,
did-document: parsed-did-doc,
did-cache-until: timestamp,
endpoints: map<(protocol, endpoint-id),
{
url: URL,
version: string,
migrations: map<string, migration-delta>,
deprecated: { sunset, replacement, reason } or null
}>,
last-applied: map<entry-id, { canonical-payload-hash, signature }>,
last-poll-at: timestamp,
next-poll-at: timestamp
}

<CODE ENDS>

The exact in-memory representation is implementation-defined; the
queries the reader must answer ({{apply-by-type}}, {{idempotency}})
constrain it but do not prescribe it.

## D.2 Producer State Sketch

A minimal publisher's persistent state for a single origin is:

<CODE BEGINS>

publisher-state {
origin: URL,
private-key: ed25519-private-key,
did-document: parsed-did-doc,
feed-status: {active, terminated, migrated},
migrated-to: URL or null,
entries: sequence<entry>,
snapshot: json-document,
}

<CODE ENDS>

A publisher rotating a key adds a new verification method to its DID
document, then optionally re-emits past entries under the new key with
new ids (the old entries remain valid under the old key for as long
as the old verification method is in `did.json`).

## D.3 Common Implementation Pitfalls

The following are common implementation errors observed in early
prototypes. They are non-normative.

- Computing canonical JSON via the language's default JSON.stringify
  and assuming key order. Default serialization is implementation-
  defined for object key order; the canonical encoding requires
  explicit lexicographic sorting.

- Trimming whitespace from `<af:sig>` after base64url decoding. The
  decoded bytes must be exactly 64 octets; whitespace within the
  base64url string MUST be ignored before decoding, but trailing
  characters after decoding are not allowed.

- Caching the DID document beyond `Cache-Control: max-age`. A
  publisher rotating a key relies on readers re-fetching the DID
  document on the next poll; aggressive client-side caching defeats
  this.

- Applying entries by `<updated>` timestamp. The protocol specifies
  document order. Two publishers writing entries with overlapping
  timestamps (intentionally or otherwise) will produce different
  application sequences if a reader sorts by timestamp.

- Treating an unknown entry type as an error. The protocol specifies
  forward-pessimism: log and continue. A reader that errors on
  unknown types cannot interoperate with later versions of the
  protocol.

- Auto-rolling-back to a fallback version on mismatch. The protocol
  specifies that the reader reports the mismatch with a fallback
  version; the agent decides whether to roll back. Auto-rollback
  hides the disagreement and removes the agent's policy from the
  loop.

- Using the snapshot to fill historical gaps. The snapshot has no
  history; only the feed has temporal authority. A reader that uses
  the snapshot to reconstruct missing history is constructing fiction.

## D.4 Test Vectors

A reference test vector set is published alongside the reference
implementation. The vector set covers:

- canonicalization fixtures (input JSON / expected canonical bytes);

- signature fixtures (canonical bytes / private key seed / expected
  signature);

- DID document fixtures (well-formed and malformed);

- feed fixtures exercising each entry type, the kill switch, and
  forward-compatibility behavior;

- mismatch fixtures exercising {{disagreement-mismatch}} cases.

Implementations claiming conformance SHOULD pass against a published
test vector set version and MAY publish their pass-rate.

## D.5 Deployment Patterns

The simplest deployment pattern for a publisher:

1. Generate an Ed25519 keypair. Store the private key in the
   publisher's secrets manager.

2. Publish a DID document at `/.well-known/did.json` exposing the
   public key as an `Ed25519VerificationKey2020`.

3. Publish an empty feed at `/.well-known/agent-feed.xml` containing
   only `af:spec-version`, `af:feed-status: active`, and feed-level
   metadata.

4. Publish a snapshot at `/.well-known/agent-card.json` describing
   the current surface in whatever capability format the publisher
   has chosen.

5. When an event occurs (an endpoint announcement, a schema change,
   a deprecation), the publisher:

   a. constructs the JSON payload;
   b. canonicalizes it per {{canonical-json}};
   c. signs the canonical bytes;
   d. embeds the canonical bytes and the base64url signature in a
   new `<entry>`;
   e. appends the entry to the feed and re-publishes;
   f. updates the snapshot to remain consistent.

The simplest deployment pattern for a reader:

1. For each origin of interest, fetch the DID document and cache
   per `Cache-Control`.

2. Fetch the feed on the polling cadence and parse it.

3. For each entry in document order, verify and apply per
   {{reader-contract}}.

4. Expose the per-origin endpoint table to the agent layer through
   whatever interface the reader implementation provides.

5. Surface events (`unverified-entry`, `unknown-entry-type`,
   `mismatch`, `replay-mismatch`, `did-unreachable`,
   `deprecation-of-unknown`) on a structured event channel for
   operator visibility.

# Appendix E: Change Log {#appendix-changelog}

This appendix is non-normative.

## E.1 draft-abdi-agent-feed-00

Initial submission. Protocol version `af:spec-version: 0`.
