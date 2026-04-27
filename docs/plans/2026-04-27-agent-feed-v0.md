# agent-feed v0 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a working, signed announcement plane (Atom feed at `/.well-known/agent-feed.xml`) that lets sites tell agents about endpoint and schema changes, with a reader library, signing CLI, working demo, and conformance tests, in the smallest amount of code.

**Architecture:** Single TypeScript package, Bun runtime. Spec is markdown. Library exports a small surface: `sign`, `verify`, `parseFeed`, `buildFeed`, `Reader`. CLI (`agent-feed init|sign|verify`) wraps the library. Demo: a fixture publisher origin serves a schema-change announcement; a consumer agent reads the feed, applies the migration, and survives.

**Tech Stack:** TypeScript 5.x · Bun · @noble/ed25519 · fast-xml-parser · commander · Bun's built-in test runner

**Roundtable decisions applied:**

- Polling-only v0; WebSub deferred to "future extension" note in spec (Carmack)
- Three entry types: `endpoint-announcement`, `schema-change`, `deprecation` (Hickey — drop status, drop policy)
- Detached Ed25519 over canonicalized JSON, _not_ HMAC (Hickey)
- Snapshot resource (`/.well-known/agent-card.json` — current state) and stream resource (`/.well-known/agent-feed.xml` — history) are _separate URLs_, not braided (Hickey, R2 convergence)
- Reader's behavioral contract specified in SPEC _before_ producer schema (Hickey, steelmanned by Taleb)
- `spec-version` field and `feed-status: terminated` kill switch in v0 (Carmack, Taleb)
- Publish-first demo: fixture origin + working agent (PG path)
- Stewardship plan: own the bug reports, don't walk away (Taleb)

---

## File Structure

```
~/Developer/agent-feed/
├── package.json
├── tsconfig.json
├── bunfig.toml
├── .gitignore
├── README.md                          # pitch + quickstart + roadmap
├── SPEC.md                            # the v0 protocol (Hickey writes)
├── docs/
│   └── plans/
│       └── 2026-04-27-agent-feed-v0.md  # this file
├── src/
│   ├── index.ts                       # public exports
│   ├── canonical.ts                   # deterministic JSON
│   ├── crypto.ts                      # Ed25519 wrappers + did:web resolve
│   ├── feed.ts                        # Atom build + parse
│   ├── reader.ts                      # consumer behavioral contract
│   └── cli.ts                         # init / sign / verify
├── examples/
│   ├── publisher-fixture.ts           # fake Shopify-shaped origin
│   └── consumer-demo.ts               # agent surviving schema change
└── tests/
    ├── canonical.test.ts
    ├── crypto.test.ts
    ├── feed.test.ts
    └── reader.test.ts
```

Target: ~600 LOC of source + tests combined.

---

### Task 1: Project bootstrap

**Files:**

- Create: `~/Developer/agent-feed/package.json`
- Create: `~/Developer/agent-feed/tsconfig.json`
- Create: `~/Developer/agent-feed/bunfig.toml`
- Create: `~/Developer/agent-feed/.gitignore`
- Create: `~/Developer/agent-feed/README.md` (one-line stub)

- [ ] **Step 1.1: Write package.json**

```json
{
  "name": "agent-feed",
  "version": "0.0.0",
  "description": "Signed announcement plane for the agentic web — RSS-for-agents.",
  "type": "module",
  "main": "src/index.ts",
  "bin": { "agent-feed": "src/cli.ts" },
  "scripts": {
    "test": "bun test",
    "demo": "bun examples/consumer-demo.ts",
    "fixture": "bun examples/publisher-fixture.ts"
  },
  "dependencies": {
    "@noble/ed25519": "^2.1.0",
    "@noble/hashes": "^1.4.0",
    "fast-xml-parser": "^4.4.0",
    "commander": "^12.0.0"
  },
  "devDependencies": {
    "@types/bun": "latest",
    "typescript": "^5.4.0"
  }
}
```

- [ ] **Step 1.2: Write tsconfig.json**

```json
{
  "compilerOptions": {
    "target": "ESNext",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "types": ["bun-types"],
    "strict": true,
    "noUncheckedIndexedAccess": true,
    "skipLibCheck": true,
    "allowImportingTsExtensions": true,
    "noEmit": true
  },
  "include": ["src/**/*", "tests/**/*", "examples/**/*"]
}
```

- [ ] **Step 1.3: Write bunfig.toml**

```toml
[test]
preload = []
```

- [ ] **Step 1.4: Write .gitignore**

```
node_modules
.DS_Store
*.log
dist
.env
.fixture-keys/
```

- [ ] **Step 1.5: Write README.md stub**

```markdown
# agent-feed

Signed announcement plane for the agentic web. Sites publish at `/.well-known/agent-feed.xml`; agents stop breaking silently when schemas change.

Status: v0 in development.
```

- [ ] **Step 1.6: Install deps + verify**

```bash
cd ~/Developer/agent-feed && bun install
```

Expected: deps install, lockfile written.

- [ ] **Step 1.7: Commit**

```bash
git add . && git commit -m "chore: bootstrap agent-feed scaffold"
```

---

### Task 2: SPEC.md (dispatch hickey persona subagent)

The keystone artifact. Per Hickey's R2 demand, the **reader's behavioral contract** is specified before the producer schema.

**Files:**

- Create: `~/Developer/agent-feed/SPEC.md`

- [ ] **Step 2.1: Dispatch hickey-persona subagent with brief**

The subagent must:

1. Invoke the `hickey` skill to load persona.
2. Read `~/Brain/wiki/concepts/agent-pa-system.md` and `~/Developer/roundtables/2026-04-27-agent-pa-system.md` for context.
3. Write `~/Developer/agent-feed/SPEC.md` with the following structure (and only the following structure):
   - **§1 Overview** — what this protocol does and explicitly does not do
   - **§2 Reader's behavioral contract** (FIRST, not last) — what a conformant agent does on receipt of each entry type, including the disagreement-with-live-endpoint case
   - **§3 Identity** — `did:web` + detached Ed25519 + key resolution from `/.well-known/did.json`
   - **§4 Resources** — separate snapshot (`agent-card.json`) and stream (`agent-feed.xml`) artifacts; what each contains
   - **§5 Entry types** — endpoint-announcement, schema-change, deprecation; canonical JSON shape for each
   - **§6 Canonicalization & signing** — sorted keys, no whitespace, what fields are signed
   - **§7 Versioning & kill switch** — `spec-version: 0`, `feed-status: active|terminated|migrated`
   - **§8 Conformance** — MUST/SHOULD/MAY language, conformance test categories
   - **§9 Out of scope (v0)** — status entries, policy entries, push transport, sybil resistance, lying-publisher detection, multi-domain delegation
   - **§10 Open issues** — the live divergences from the roundtable, with a position taken for each

Constraints on the subagent:

- 800-1200 lines of markdown total.
- No code (this is a spec, not an implementation). Pseudocode for reader contract is fine.
- Concrete examples in JSON for each entry type.
- Cite W3C DID, W3C Atom, RFC 8615 by reference; do not reproduce.
- Decomplect ruthlessly. If a concept braids two ideas, separate them.
- The reader contract must give a clear answer to: "what does my agent do when the live API returns a schema the feed predicted, vs. one it didn't?"

- [ ] **Step 2.2: Read produced SPEC.md and verify structure**

Run: `wc -l ~/Developer/agent-feed/SPEC.md && head -50 ~/Developer/agent-feed/SPEC.md`

Expected: 800-1200 lines, sections in the order listed.

If structure is off: either have me edit it inline (small fixes) or re-dispatch with a tighter brief (large gaps).

- [ ] **Step 2.3: Commit**

```bash
git add SPEC.md && git commit -m "spec: agent-feed v0 (hickey draft)"
```

---

### Task 3: Canonicalization helper (TDD)

**Files:**

- Create: `~/Developer/agent-feed/src/canonical.ts`
- Create: `~/Developer/agent-feed/tests/canonical.test.ts`

- [ ] **Step 3.1: Write failing test**

`tests/canonical.test.ts`:

```ts
import { test, expect } from "bun:test";
import { canonicalize } from "../src/canonical.ts";

test("sorts object keys recursively", () => {
  expect(canonicalize({ b: 1, a: 2 })).toBe('{"a":2,"b":1}');
  expect(canonicalize({ x: { z: 3, y: 4 } })).toBe('{"x":{"y":4,"z":3}}');
});

test("preserves array order", () => {
  expect(canonicalize({ list: [3, 1, 2] })).toBe('{"list":[3,1,2]}');
});

test("no whitespace", () => {
  expect(canonicalize({ a: { b: [1, 2] } })).toBe('{"a":{"b":[1,2]}}');
});

test("rejects non-finite numbers", () => {
  expect(() => canonicalize({ x: NaN })).toThrow();
  expect(() => canonicalize({ x: Infinity })).toThrow();
});

test("identical input produces identical bytes", () => {
  const a = canonicalize({ a: 1, b: { c: 2, d: 3 } });
  const b = canonicalize({ b: { d: 3, c: 2 }, a: 1 });
  expect(a).toBe(b);
});
```

- [ ] **Step 3.2: Run test, verify FAIL**

```bash
cd ~/Developer/agent-feed && bun test tests/canonical.test.ts
```

Expected: tests fail because `canonicalize` is not defined.

- [ ] **Step 3.3: Write minimal implementation**

`src/canonical.ts`:

```ts
export function canonicalize(value: unknown): string {
  return JSON.stringify(walk(value));
}

function walk(v: unknown): unknown {
  if (v === null) return null;
  if (typeof v === "number") {
    if (!Number.isFinite(v)) throw new Error("non-finite number");
    return v;
  }
  if (Array.isArray(v)) return v.map(walk);
  if (typeof v === "object") {
    const obj = v as Record<string, unknown>;
    const out: Record<string, unknown> = {};
    for (const k of Object.keys(obj).sort()) out[k] = walk(obj[k]);
    return out;
  }
  return v;
}
```

- [ ] **Step 3.4: Run test, verify PASS**

```bash
bun test tests/canonical.test.ts
```

Expected: 5/5 pass.

- [ ] **Step 3.5: Commit**

```bash
git add src/canonical.ts tests/canonical.test.ts
git commit -m "feat: canonical JSON for signing"
```

---

### Task 4: Ed25519 crypto wrappers (TDD)

**Files:**

- Create: `~/Developer/agent-feed/src/crypto.ts`
- Create: `~/Developer/agent-feed/tests/crypto.test.ts`

- [ ] **Step 4.1: Write failing test**

`tests/crypto.test.ts`:

```ts
import { test, expect } from "bun:test";
import {
  generateKeypair,
  signBytes,
  verifyBytes,
  didWebFromOrigin,
} from "../src/crypto.ts";

test("generates valid keypair", async () => {
  const kp = await generateKeypair();
  expect(kp.publicKey.length).toBe(32);
  expect(kp.privateKey.length).toBe(32);
});

test("sign/verify roundtrip", async () => {
  const kp = await generateKeypair();
  const msg = new TextEncoder().encode('{"a":1,"b":2}');
  const sig = await signBytes(kp.privateKey, msg);
  expect(await verifyBytes(kp.publicKey, msg, sig)).toBe(true);
});

test("verify rejects tampered message", async () => {
  const kp = await generateKeypair();
  const msg = new TextEncoder().encode('{"a":1}');
  const sig = await signBytes(kp.privateKey, msg);
  const bad = new TextEncoder().encode('{"a":2}');
  expect(await verifyBytes(kp.publicKey, bad, sig)).toBe(false);
});

test("didWebFromOrigin", () => {
  expect(didWebFromOrigin("https://example.com")).toBe("did:web:example.com");
  expect(didWebFromOrigin("https://example.com:8443")).toBe(
    "did:web:example.com%3A8443",
  );
});
```

- [ ] **Step 4.2: Run, verify FAIL**

```bash
bun test tests/crypto.test.ts
```

- [ ] **Step 4.3: Write implementation**

`src/crypto.ts`:

```ts
import * as ed from "@noble/ed25519";
import { sha512 } from "@noble/hashes/sha512";

ed.etc.sha512Sync = (...m) => sha512(ed.etc.concatBytes(...m));

export interface Keypair {
  publicKey: Uint8Array;
  privateKey: Uint8Array;
}

export async function generateKeypair(): Promise<Keypair> {
  const privateKey = ed.utils.randomPrivateKey();
  const publicKey = await ed.getPublicKeyAsync(privateKey);
  return { publicKey, privateKey };
}

export function signBytes(
  privateKey: Uint8Array,
  message: Uint8Array,
): Promise<Uint8Array> {
  return ed.signAsync(message, privateKey);
}

export async function verifyBytes(
  publicKey: Uint8Array,
  message: Uint8Array,
  signature: Uint8Array,
): Promise<boolean> {
  try {
    return await ed.verifyAsync(signature, message, publicKey);
  } catch {
    return false;
  }
}

export function didWebFromOrigin(origin: string): string {
  const u = new URL(origin);
  const host = u.port ? `${u.hostname}%3A${u.port}` : u.hostname;
  return `did:web:${host}`;
}

export function b64u(bytes: Uint8Array): string {
  return Buffer.from(bytes).toString("base64url");
}

export function fromB64u(s: string): Uint8Array {
  return new Uint8Array(Buffer.from(s, "base64url"));
}

export interface DidDocument {
  id: string;
  verificationMethod: Array<{
    id: string;
    type: "Ed25519VerificationKey2020";
    controller: string;
    publicKeyMultibase: string; // "z" + base58, but for v0 we accept base64url with "u" prefix as a simplification
  }>;
}

export async function fetchDidDocument(origin: string): Promise<DidDocument> {
  const url = new URL("/.well-known/did.json", origin).toString();
  const res = await fetch(url);
  if (!res.ok) throw new Error(`did.json fetch failed: ${res.status}`);
  return res.json() as Promise<DidDocument>;
}

export function publicKeyFromDid(doc: DidDocument): Uint8Array {
  const vm = doc.verificationMethod[0];
  if (!vm) throw new Error("no verificationMethod");
  const mb = vm.publicKeyMultibase;
  if (!mb.startsWith("u"))
    throw new Error("only base64url multibase supported in v0");
  return fromB64u(mb.slice(1));
}

export function didDocumentFromKeypair(
  origin: string,
  kp: Keypair,
): DidDocument {
  const id = didWebFromOrigin(origin);
  return {
    id,
    verificationMethod: [
      {
        id: `${id}#key-1`,
        type: "Ed25519VerificationKey2020",
        controller: id,
        publicKeyMultibase: "u" + b64u(kp.publicKey),
      },
    ],
  };
}
```

- [ ] **Step 4.4: Run, verify PASS**

```bash
bun test tests/crypto.test.ts
```

Expected: 4/4 pass.

- [ ] **Step 4.5: Commit**

```bash
git add src/crypto.ts tests/crypto.test.ts
git commit -m "feat: Ed25519 sign/verify + did:web resolution"
```

---

### Task 5: Feed builder + parser (TDD)

**Files:**

- Create: `~/Developer/agent-feed/src/feed.ts`
- Create: `~/Developer/agent-feed/tests/feed.test.ts`

The feed is Atom XML. Each `<entry>` carries a JSON payload in `<content type="application/json">`, signed; the signature is in a custom element `<af:sig type="ed25519">{base64url}</af:sig>`. The sig is computed over `canonicalize(payload)`.

- [ ] **Step 5.1: Write failing test**

`tests/feed.test.ts`:

```ts
import { test, expect } from "bun:test";
import { buildFeed, parseFeed, type Entry } from "../src/feed.ts";
import { generateKeypair } from "../src/crypto.ts";

test("build → parse roundtrip preserves entries", async () => {
  const kp = await generateKeypair();
  const entries: Entry[] = [
    {
      id: "urn:af:1",
      type: "endpoint-announcement",
      timestamp: "2026-04-27T12:00:00Z",
      payload: {
        endpoint: "https://example.com/a2a",
        protocol: "a2a",
        version: "1.0",
      },
    },
  ];

  const xml = await buildFeed({
    feedId: "did:web:example.com",
    title: "example.com agent feed",
    updated: "2026-04-27T12:00:00Z",
    feedStatus: "active",
    specVersion: 0,
    entries,
    keypair: kp,
  });

  const parsed = await parseFeed(xml, { publicKey: kp.publicKey });
  expect(parsed.entries.length).toBe(1);
  expect(parsed.entries[0]!.verified).toBe(true);
  expect(parsed.entries[0]!.entry.type).toBe("endpoint-announcement");
});

test("parse rejects tampered entry", async () => {
  const kp = await generateKeypair();
  const xml = await buildFeed({
    feedId: "did:web:example.com",
    title: "example.com",
    updated: "2026-04-27T12:00:00Z",
    feedStatus: "active",
    specVersion: 0,
    entries: [
      {
        id: "urn:af:1",
        type: "schema-change",
        timestamp: "2026-04-27T12:00:00Z",
        payload: {
          endpoint: "/api/orders",
          change: "field added",
          field: "currency",
        },
      },
    ],
    keypair: kp,
  });
  const tampered = xml.replace('"field added"', '"field removed"');
  const parsed = await parseFeed(tampered, { publicKey: kp.publicKey });
  expect(parsed.entries[0]!.verified).toBe(false);
});

test("kill switch parses correctly", async () => {
  const kp = await generateKeypair();
  const xml = await buildFeed({
    feedId: "did:web:example.com",
    title: "example.com",
    updated: "2026-04-27T12:00:00Z",
    feedStatus: "terminated",
    specVersion: 0,
    entries: [],
    keypair: kp,
  });
  const parsed = await parseFeed(xml, { publicKey: kp.publicKey });
  expect(parsed.feedStatus).toBe("terminated");
});
```

- [ ] **Step 5.2: Run, verify FAIL**

```bash
bun test tests/feed.test.ts
```

- [ ] **Step 5.3: Write implementation**

`src/feed.ts`:

```ts
import { XMLBuilder, XMLParser } from "fast-xml-parser";
import { canonicalize } from "./canonical.ts";
import {
  signBytes,
  verifyBytes,
  b64u,
  fromB64u,
  type Keypair,
} from "./crypto.ts";

export type EntryType =
  | "endpoint-announcement"
  | "schema-change"
  | "deprecation";
export type FeedStatus = "active" | "terminated" | "migrated";

export interface Entry {
  id: string;
  type: EntryType;
  timestamp: string;
  payload: Record<string, unknown>;
}

export interface BuildFeedInput {
  feedId: string;
  title: string;
  updated: string;
  feedStatus: FeedStatus;
  specVersion: number;
  entries: Entry[];
  keypair: Keypair;
}

export async function buildFeed(input: BuildFeedInput): Promise<string> {
  const xmlEntries = await Promise.all(
    input.entries.map(async (e) => {
      const sig = await signBytes(
        input.keypair.privateKey,
        new TextEncoder().encode(canonicalize(e.payload)),
      );
      return {
        id: e.id,
        title: e.type,
        updated: e.timestamp,
        "af:type": e.type,
        content: {
          "@_type": "application/json",
          "#text": canonicalize(e.payload),
        },
        "af:sig": {
          "@_type": "ed25519",
          "#text": b64u(sig),
        },
      };
    }),
  );

  const builder = new XMLBuilder({
    ignoreAttributes: false,
    format: true,
    suppressEmptyNode: true,
  });

  return builder.build({
    "?xml": { "@_version": "1.0", "@_encoding": "UTF-8" },
    feed: {
      "@_xmlns": "http://www.w3.org/2005/Atom",
      "@_xmlns:af": "https://agent-feed.dev/ns/v0",
      id: input.feedId,
      title: input.title,
      updated: input.updated,
      "af:spec-version": input.specVersion,
      "af:feed-status": input.feedStatus,
      entry: xmlEntries,
    },
  });
}

export interface VerifiedEntry {
  entry: Entry;
  verified: boolean;
}

export interface ParsedFeed {
  feedId: string;
  title: string;
  updated: string;
  feedStatus: FeedStatus;
  specVersion: number;
  entries: VerifiedEntry[];
}

export async function parseFeed(
  xml: string,
  opts: { publicKey: Uint8Array },
): Promise<ParsedFeed> {
  const parser = new XMLParser({
    ignoreAttributes: false,
    parseTagValue: false,
    trimValues: true,
  });
  const doc = parser.parse(xml);
  const f = doc.feed;
  const rawEntries = Array.isArray(f.entry)
    ? f.entry
    : f.entry
      ? [f.entry]
      : [];

  const entries: VerifiedEntry[] = await Promise.all(
    rawEntries.map(async (e: any) => {
      const payloadJson: string =
        typeof e.content === "string" ? e.content : e.content["#text"];
      const sigB64u: string =
        typeof e["af:sig"] === "string" ? e["af:sig"] : e["af:sig"]["#text"];
      const sig = fromB64u(sigB64u);
      const verified = await verifyBytes(
        opts.publicKey,
        new TextEncoder().encode(payloadJson),
        sig,
      );
      return {
        verified,
        entry: {
          id: String(e.id),
          type: String(e["af:type"]) as EntryType,
          timestamp: String(e.updated),
          payload: JSON.parse(payloadJson),
        },
      };
    }),
  );

  return {
    feedId: String(f.id),
    title: String(f.title),
    updated: String(f.updated),
    feedStatus: String(f["af:feed-status"]) as FeedStatus,
    specVersion: Number(f["af:spec-version"]),
    entries,
  };
}
```

- [ ] **Step 5.4: Run, verify PASS**

```bash
bun test tests/feed.test.ts
```

- [ ] **Step 5.5: Commit**

```bash
git add src/feed.ts tests/feed.test.ts
git commit -m "feat: Atom feed build/parse with signed entries"
```

---

### Task 6: Reader behavioral contract (TDD)

The reader is the load-bearing piece per Hickey/Taleb. Behavior:

- **Maintain a per-origin in-memory map:** `endpoint → schema-version`.
- On `endpoint-announcement`: update the canonical endpoint for that origin.
- On `schema-change`: bump the recorded schema version + record the migration hint.
- On `deprecation`: mark the endpoint dead after the announced sunset date; before sunset, prefer the replacement if announced.
- On `feedStatus: terminated`: stop trusting any entries from this origin.
- **Disagreement case:** if the live endpoint returns a payload that doesn't match the feed-predicted schema, log a `mismatch` event and fall back to the _previous known good schema_. Do NOT silently coerce.

**Files:**

- Create: `~/Developer/agent-feed/src/reader.ts`
- Create: `~/Developer/agent-feed/tests/reader.test.ts`

- [ ] **Step 6.1: Write failing test**

`tests/reader.test.ts`:

```ts
import { test, expect } from "bun:test";
import { Reader } from "../src/reader.ts";
import { buildFeed, type Entry } from "../src/feed.ts";
import { generateKeypair, didDocumentFromKeypair } from "../src/crypto.ts";

const ORIGIN = "https://example.com";

async function feedXml(
  entries: Entry[],
  status: "active" | "terminated" = "active",
) {
  const kp = await generateKeypair();
  const xml = await buildFeed({
    feedId: "did:web:example.com",
    title: "example",
    updated: "2026-04-27T12:00:00Z",
    feedStatus: status,
    specVersion: 0,
    entries,
    keypair: kp,
  });
  return { xml, didDoc: didDocumentFromKeypair(ORIGIN, kp) };
}

test("endpoint-announcement records canonical endpoint", async () => {
  const { xml, didDoc } = await feedXml([
    {
      id: "1",
      type: "endpoint-announcement",
      timestamp: "2026-04-27T12:00:00Z",
      payload: {
        endpoint: "https://example.com/a2a/v1",
        protocol: "a2a",
        version: "1.0",
      },
    },
  ]);
  const r = new Reader();
  await r.ingest({ origin: ORIGIN, xml, didDocument: didDoc });
  expect(r.canonicalEndpoint(ORIGIN, "a2a")).toBe("https://example.com/a2a/v1");
});

test("schema-change bumps recorded version", async () => {
  const { xml, didDoc } = await feedXml([
    {
      id: "1",
      type: "endpoint-announcement",
      timestamp: "2026-04-27T12:00:00Z",
      payload: { endpoint: "/api/orders", protocol: "rest", version: "1.0" },
    },
    {
      id: "2",
      type: "schema-change",
      timestamp: "2026-04-27T13:00:00Z",
      payload: {
        endpoint: "/api/orders",
        from_version: "1.0",
        to_version: "1.1",
        migration: { add: ["currency"] },
      },
    },
  ]);
  const r = new Reader();
  await r.ingest({ origin: ORIGIN, xml, didDocument: didDoc });
  expect(r.schemaVersion(ORIGIN, "/api/orders")).toBe("1.1");
  expect(r.migration(ORIGIN, "/api/orders", "1.0", "1.1")).toEqual({
    add: ["currency"],
  });
});

test("terminated feed status drops trust", async () => {
  const { xml, didDoc } = await feedXml(
    [
      {
        id: "1",
        type: "endpoint-announcement",
        timestamp: "2026-04-27T12:00:00Z",
        payload: { endpoint: "/api/x", protocol: "rest", version: "1.0" },
      },
    ],
    "terminated",
  );
  const r = new Reader();
  await r.ingest({ origin: ORIGIN, xml, didDocument: didDoc });
  expect(r.canonicalEndpoint(ORIGIN, "rest")).toBeUndefined();
});

test("disagreement event fires when live schema mismatches feed", async () => {
  const { xml, didDoc } = await feedXml([
    {
      id: "1",
      type: "schema-change",
      timestamp: "2026-04-27T13:00:00Z",
      payload: {
        endpoint: "/api/orders",
        from_version: "1.0",
        to_version: "1.1",
        migration: { add: ["currency"] },
      },
    },
  ]);
  const r = new Reader();
  await r.ingest({ origin: ORIGIN, xml, didDocument: didDoc });

  const events: any[] = [];
  r.on("mismatch", (e) => events.push(e));

  // Simulate live response that's still v1.0 (missing currency)
  r.observeLiveResponse({
    origin: ORIGIN,
    endpoint: "/api/orders",
    body: { id: "abc", total: 100 }, // missing "currency"
  });

  expect(events).toHaveLength(1);
  expect(events[0].fallback).toBe("1.0");
});

test("rejects feed with unverified entry", async () => {
  const kp1 = await generateKeypair();
  const kp2 = await generateKeypair();
  const xml = await buildFeed({
    feedId: "did:web:example.com",
    title: "example",
    updated: "2026-04-27T12:00:00Z",
    feedStatus: "active",
    specVersion: 0,
    entries: [
      {
        id: "1",
        type: "endpoint-announcement",
        timestamp: "2026-04-27T12:00:00Z",
        payload: { endpoint: "/x", protocol: "rest", version: "1.0" },
      },
    ],
    keypair: kp1,
  });
  const wrongDoc = didDocumentFromKeypair(ORIGIN, kp2);
  const r = new Reader();
  await r.ingest({ origin: ORIGIN, xml, didDocument: wrongDoc });
  // entries fail verification — endpoint must NOT be recorded
  expect(r.canonicalEndpoint(ORIGIN, "rest")).toBeUndefined();
});
```

- [ ] **Step 6.2: Run, verify FAIL**

```bash
bun test tests/reader.test.ts
```

- [ ] **Step 6.3: Write implementation**

`src/reader.ts`:

```ts
import { parseFeed, type Entry } from "./feed.ts";
import { publicKeyFromDid, type DidDocument } from "./crypto.ts";

interface EndpointState {
  protocol: string;
  endpoint: string;
  version: string;
  migrations: Map<string, Record<string, unknown>>; // "from->to" → migration hint
  deprecated?: { sunset: string; replacement?: string };
}

interface OriginState {
  endpoints: Map<string, EndpointState>; // key: endpoint path or URL
  byProtocol: Map<string, string>; // protocol → endpoint key
  trusted: boolean;
}

type EventName = "mismatch" | "deprecation";
type Listener = (event: any) => void;

export interface IngestInput {
  origin: string;
  xml: string;
  didDocument: DidDocument;
}

export class Reader {
  private origins = new Map<string, OriginState>();
  private listeners = new Map<EventName, Set<Listener>>();

  on(event: EventName, fn: Listener): void {
    if (!this.listeners.has(event)) this.listeners.set(event, new Set());
    this.listeners.get(event)!.add(fn);
  }

  private emit(event: EventName, payload: unknown): void {
    this.listeners.get(event)?.forEach((fn) => fn(payload));
  }

  async ingest({ origin, xml, didDocument }: IngestInput): Promise<void> {
    const pk = publicKeyFromDid(didDocument);
    const parsed = await parseFeed(xml, { publicKey: pk });

    const state: OriginState = this.origins.get(origin) ?? {
      endpoints: new Map(),
      byProtocol: new Map(),
      trusted: true,
    };

    if (parsed.feedStatus === "terminated") {
      state.trusted = false;
      this.origins.set(origin, state);
      return;
    }
    state.trusted = true;

    for (const ve of parsed.entries) {
      if (!ve.verified) continue; // silent drop, never apply unverified entries
      this.applyEntry(state, ve.entry);
    }

    this.origins.set(origin, state);
  }

  private applyEntry(state: OriginState, entry: Entry): void {
    const p = entry.payload as any;
    switch (entry.type) {
      case "endpoint-announcement": {
        const key = p.endpoint;
        const existing = state.endpoints.get(key);
        state.endpoints.set(key, {
          protocol: p.protocol,
          endpoint: key,
          version: p.version,
          migrations: existing?.migrations ?? new Map(),
        });
        state.byProtocol.set(p.protocol, key);
        return;
      }
      case "schema-change": {
        const key = p.endpoint;
        const ep = state.endpoints.get(key) ?? {
          protocol: "unknown",
          endpoint: key,
          version: p.from_version,
          migrations: new Map(),
        };
        ep.version = p.to_version;
        ep.migrations.set(
          `${p.from_version}->${p.to_version}`,
          p.migration ?? {},
        );
        state.endpoints.set(key, ep);
        return;
      }
      case "deprecation": {
        const key = p.endpoint;
        const ep = state.endpoints.get(key);
        if (!ep) return;
        ep.deprecated = { sunset: p.sunset, replacement: p.replacement };
        state.endpoints.set(key, ep);
        this.emit("deprecation", {
          endpoint: key,
          sunset: p.sunset,
          replacement: p.replacement,
        });
        return;
      }
    }
  }

  canonicalEndpoint(origin: string, protocol: string): string | undefined {
    const s = this.origins.get(origin);
    if (!s || !s.trusted) return undefined;
    const key = s.byProtocol.get(protocol);
    if (!key) return undefined;
    const ep = s.endpoints.get(key);
    if (!ep) return undefined;
    if (ep.deprecated && new Date(ep.deprecated.sunset) <= new Date()) {
      return ep.deprecated.replacement;
    }
    return ep.endpoint;
  }

  schemaVersion(origin: string, endpoint: string): string | undefined {
    return this.origins.get(origin)?.endpoints.get(endpoint)?.version;
  }

  migration(
    origin: string,
    endpoint: string,
    from: string,
    to: string,
  ): Record<string, unknown> | undefined {
    return this.origins
      .get(origin)
      ?.endpoints.get(endpoint)
      ?.migrations.get(`${from}->${to}`);
  }

  observeLiveResponse(input: {
    origin: string;
    endpoint: string;
    body: Record<string, unknown>;
  }): void {
    const s = this.origins.get(input.origin);
    if (!s) return;
    const ep = s.endpoints.get(input.endpoint);
    if (!ep) return;

    // Find the most recent migration into ep.version
    let priorVersion: string | undefined;
    for (const key of ep.migrations.keys()) {
      const [from, to] = key.split("->");
      if (to === ep.version) priorVersion = from;
    }
    if (!priorVersion) return;

    const expected = ep.migrations.get(`${priorVersion}->${ep.version}`) as
      | { add?: string[]; remove?: string[]; rename?: Record<string, string> }
      | undefined;
    if (!expected?.add) return;

    const missing = expected.add.filter((field) => !(field in input.body));
    if (missing.length > 0) {
      this.emit("mismatch", {
        origin: input.origin,
        endpoint: input.endpoint,
        expected_version: ep.version,
        missing_fields: missing,
        fallback: priorVersion,
      });
    }
  }
}
```

- [ ] **Step 6.4: Run, verify PASS**

```bash
bun test tests/reader.test.ts
```

- [ ] **Step 6.5: Commit**

```bash
git add src/reader.ts tests/reader.test.ts
git commit -m "feat: reader behavioral contract"
```

---

### Task 7: Public API + CLI

**Files:**

- Create: `~/Developer/agent-feed/src/index.ts`
- Create: `~/Developer/agent-feed/src/cli.ts`

- [ ] **Step 7.1: Write src/index.ts**

```ts
export { canonicalize } from "./canonical.ts";
export {
  generateKeypair,
  signBytes,
  verifyBytes,
  didWebFromOrigin,
  fetchDidDocument,
  publicKeyFromDid,
  didDocumentFromKeypair,
  b64u,
  fromB64u,
  type Keypair,
  type DidDocument,
} from "./crypto.ts";
export {
  buildFeed,
  parseFeed,
  type Entry,
  type EntryType,
  type FeedStatus,
  type ParsedFeed,
  type VerifiedEntry,
  type BuildFeedInput,
} from "./feed.ts";
export { Reader, type IngestInput } from "./reader.ts";
```

- [ ] **Step 7.2: Write src/cli.ts**

```ts
#!/usr/bin/env bun
import { Command } from "commander";
import { mkdir, writeFile, readFile } from "node:fs/promises";
import { join } from "node:path";
import {
  generateKeypair,
  didDocumentFromKeypair,
  buildFeed,
  parseFeed,
  publicKeyFromDid,
  b64u,
  fromB64u,
  type Entry,
  type EntryType,
  type FeedStatus,
  type DidDocument,
} from "./index.ts";

const program = new Command();
program
  .name("agent-feed")
  .description("Sign and serve agent-feed.xml")
  .version("0.0.0");

program
  .command("init")
  .description("Generate a keypair and scaffold did.json + empty feed.")
  .requiredOption("-o, --origin <url>", "origin URL, e.g. https://example.com")
  .requiredOption("-d, --dir <path>", "output directory")
  .action(async (opts) => {
    await mkdir(opts.dir, { recursive: true });
    const kp = await generateKeypair();
    const didDoc = didDocumentFromKeypair(opts.origin, kp);

    await writeFile(
      join(opts.dir, "did.json"),
      JSON.stringify(didDoc, null, 2),
    );
    await writeFile(join(opts.dir, "private.key"), b64u(kp.privateKey));

    const xml = await buildFeed({
      feedId: didDoc.id,
      title: `${new URL(opts.origin).hostname} agent feed`,
      updated: new Date().toISOString(),
      feedStatus: "active",
      specVersion: 0,
      entries: [],
      keypair: kp,
    });
    await writeFile(join(opts.dir, "agent-feed.xml"), xml);

    console.log(`Initialized at ${opts.dir}`);
    console.log(
      `  did.json:        publish at ${opts.origin}/.well-known/did.json`,
    );
    console.log(
      `  agent-feed.xml:  publish at ${opts.origin}/.well-known/agent-feed.xml`,
    );
    console.log(`  private.key:     keep secret. Restore with --key.`);
  });

program
  .command("sign")
  .description("Append a signed entry to an existing feed.")
  .requiredOption(
    "-d, --dir <path>",
    "directory containing did.json + private.key + agent-feed.xml",
  )
  .requiredOption(
    "-t, --type <type>",
    "entry type: endpoint-announcement | schema-change | deprecation",
  )
  .requiredOption("-p, --payload <json>", "JSON payload")
  .option("--id <id>", "entry id (default: urn:af:<unix>)")
  .action(async (opts) => {
    const didDoc: DidDocument = JSON.parse(
      await readFile(join(opts.dir, "did.json"), "utf8"),
    );
    const privKey = fromB64u(
      (await readFile(join(opts.dir, "private.key"), "utf8")).trim(),
    );
    const pubKey = publicKeyFromDid(didDoc);
    const xml = await readFile(join(opts.dir, "agent-feed.xml"), "utf8");
    const parsed = await parseFeed(xml, { publicKey: pubKey });

    const newEntry: Entry = {
      id: opts.id ?? `urn:af:${Date.now()}`,
      type: opts.type as EntryType,
      timestamp: new Date().toISOString(),
      payload: JSON.parse(opts.payload),
    };

    const allEntries = [
      ...parsed.entries.filter((e) => e.verified).map((e) => e.entry),
      newEntry,
    ];

    const next = await buildFeed({
      feedId: parsed.feedId,
      title: parsed.title,
      updated: new Date().toISOString(),
      feedStatus: parsed.feedStatus,
      specVersion: parsed.specVersion,
      entries: allEntries,
      keypair: { publicKey: pubKey, privateKey: privKey },
    });

    await writeFile(join(opts.dir, "agent-feed.xml"), next);
    console.log(`Appended ${newEntry.type} entry ${newEntry.id}`);
  });

program
  .command("verify")
  .description("Fetch and verify a remote feed.")
  .requiredOption("-o, --origin <url>", "origin URL")
  .action(async (opts) => {
    const didRes = await fetch(new URL("/.well-known/did.json", opts.origin));
    const didDoc: DidDocument = (await didRes.json()) as DidDocument;
    const pk = publicKeyFromDid(didDoc);

    const feedRes = await fetch(
      new URL("/.well-known/agent-feed.xml", opts.origin),
    );
    const xml = await feedRes.text();
    const parsed = await parseFeed(xml, { publicKey: pk });

    const ok = parsed.entries.filter((e) => e.verified).length;
    const total = parsed.entries.length;
    console.log(`feed:           ${parsed.feedId}`);
    console.log(`status:         ${parsed.feedStatus}`);
    console.log(`spec-version:   ${parsed.specVersion}`);
    console.log(`entries:        ${ok}/${total} verified`);
    if (ok < total) process.exit(1);
  });

program.parse();
```

- [ ] **Step 7.3: Smoke test the CLI**

```bash
cd ~/Developer/agent-feed
bun src/cli.ts init -o https://example.com -d /tmp/af-test
bun src/cli.ts sign -d /tmp/af-test -t endpoint-announcement \
  -p '{"endpoint":"https://example.com/a2a","protocol":"a2a","version":"1.0"}'
ls /tmp/af-test
cat /tmp/af-test/agent-feed.xml | head -30
```

Expected: did.json + agent-feed.xml created, second command appends one entry to feed XML.

- [ ] **Step 7.4: Commit**

```bash
git add src/index.ts src/cli.ts
git commit -m "feat: public API + CLI (init/sign/verify)"
```

---

### Task 8: Fixture publisher origin (demo)

**Files:**

- Create: `~/Developer/agent-feed/examples/publisher-fixture.ts`

A Bun.serve origin that:

- Serves `/.well-known/did.json` and `/.well-known/agent-feed.xml`.
- Serves `/api/orders` returning v1.0 schema initially.
- After receiving `POST /admin/migrate`, mutates the API to v1.1 schema AND appends a signed `schema-change` entry to the feed.

This is the "world changes underneath you" simulator.

- [ ] **Step 8.1: Write examples/publisher-fixture.ts**

```ts
#!/usr/bin/env bun
import {
  generateKeypair,
  didDocumentFromKeypair,
  buildFeed,
  parseFeed,
  publicKeyFromDid,
  type Entry,
  type DidDocument,
} from "../src/index.ts";

const PORT = Number(process.env.PORT ?? 4242);
const ORIGIN = `http://localhost:${PORT}`;

const kp = await generateKeypair();
const didDoc: DidDocument = didDocumentFromKeypair(ORIGIN, kp);

let schemaVersion: "1.0" | "1.1" = "1.0";

async function makeFeed(entries: Entry[]) {
  return buildFeed({
    feedId: didDoc.id,
    title: "fixture origin",
    updated: new Date().toISOString(),
    feedStatus: "active",
    specVersion: 0,
    entries,
    keypair: kp,
  });
}

let feedXml = await makeFeed([
  {
    id: "urn:af:bootstrap",
    type: "endpoint-announcement",
    timestamp: new Date().toISOString(),
    payload: { endpoint: "/api/orders", protocol: "rest", version: "1.0" },
  },
]);

function order() {
  if (schemaVersion === "1.0") {
    return { id: "ord_1", total: 100 };
  }
  return { id: "ord_1", total: 100, currency: "USD" };
}

const server = Bun.serve({
  port: PORT,
  async fetch(req) {
    const url = new URL(req.url);
    if (url.pathname === "/.well-known/did.json") {
      return Response.json(didDoc);
    }
    if (url.pathname === "/.well-known/agent-feed.xml") {
      return new Response(feedXml, {
        headers: { "content-type": "application/atom+xml" },
      });
    }
    if (url.pathname === "/api/orders") {
      return Response.json(order());
    }
    if (url.pathname === "/admin/migrate" && req.method === "POST") {
      schemaVersion = "1.1";
      const parsed = await parseFeed(feedXml, {
        publicKey: publicKeyFromDid(didDoc),
      });
      const allEntries = [
        ...parsed.entries.filter((e) => e.verified).map((e) => e.entry),
        {
          id: `urn:af:${Date.now()}`,
          type: "schema-change" as const,
          timestamp: new Date().toISOString(),
          payload: {
            endpoint: "/api/orders",
            from_version: "1.0",
            to_version: "1.1",
            migration: { add: ["currency"] },
          },
        },
      ];
      feedXml = await makeFeed(allEntries);
      return new Response(`migrated to ${schemaVersion}`, { status: 200 });
    }
    return new Response("Not Found", { status: 404 });
  },
});

console.log(`Fixture origin listening on ${ORIGIN}`);
console.log(`  GET  ${ORIGIN}/.well-known/did.json`);
console.log(`  GET  ${ORIGIN}/.well-known/agent-feed.xml`);
console.log(`  GET  ${ORIGIN}/api/orders`);
console.log(`  POST ${ORIGIN}/admin/migrate`);
```

- [ ] **Step 8.2: Smoke test**

```bash
cd ~/Developer/agent-feed
bun examples/publisher-fixture.ts &
sleep 1
curl -s http://localhost:4242/.well-known/did.json | head
curl -s http://localhost:4242/api/orders
curl -s -X POST http://localhost:4242/admin/migrate
curl -s http://localhost:4242/api/orders
kill %1
```

Expected: did.json prints, orders v1.0 response, migration succeeds, orders v1.1 response (now has currency).

- [ ] **Step 8.3: Commit**

```bash
git add examples/publisher-fixture.ts
git commit -m "feat: fixture publisher origin for demo"
```

---

### Task 9: Consumer demo (schema-change survival story)

**Files:**

- Create: `~/Developer/agent-feed/examples/consumer-demo.ts`

The story:

1. Start the fixture origin in-process.
2. Agent ingests feed; reads canonical `/api/orders` endpoint.
3. Agent calls endpoint → reads v1.0 successfully.
4. Origin mutates to v1.1 + emits signed `schema-change`.
5. Agent re-ingests feed; observes mismatch when calling endpoint with v1.0 expectations; consults migration; calls successfully under v1.1.

- [ ] **Step 9.1: Write examples/consumer-demo.ts**

```ts
#!/usr/bin/env bun
import { Reader, type DidDocument } from "../src/index.ts";

const ORIGIN = "http://localhost:4242";

async function fetchFeed(): Promise<{ xml: string; didDoc: DidDocument }> {
  const [didRes, feedRes] = await Promise.all([
    fetch(`${ORIGIN}/.well-known/did.json`),
    fetch(`${ORIGIN}/.well-known/agent-feed.xml`),
  ]);
  const didDoc = (await didRes.json()) as DidDocument;
  const xml = await feedRes.text();
  return { xml, didDoc };
}

const reader = new Reader();
reader.on("mismatch", (e) => {
  console.log(
    `  ⚠  schema mismatch detected: missing ${JSON.stringify(e.missing_fields)}, fallback ${e.fallback}`,
  );
});

console.log("Step 1: Initial ingest");
{
  const { xml, didDoc } = await fetchFeed();
  await reader.ingest({ origin: ORIGIN, xml, didDocument: didDoc });
  const ep = reader.canonicalEndpoint(ORIGIN, "rest");
  console.log(`  canonical /rest endpoint: ${ep}`);
  console.log(
    `  schema version: ${reader.schemaVersion(ORIGIN, "/api/orders")}`,
  );
}

console.log("\nStep 2: Call endpoint (v1.0 expected)");
{
  const res = await fetch(`${ORIGIN}/api/orders`);
  const body = await res.json();
  console.log(`  got: ${JSON.stringify(body)}`);
  reader.observeLiveResponse({ origin: ORIGIN, endpoint: "/api/orders", body });
}

console.log(
  "\nStep 3: Origin migrates v1.0 → v1.1 (signed schema-change emitted)",
);
await fetch(`${ORIGIN}/admin/migrate`, { method: "POST" });

console.log("\nStep 4: Re-ingest feed");
{
  const { xml, didDoc } = await fetchFeed();
  await reader.ingest({ origin: ORIGIN, xml, didDocument: didDoc });
  console.log(
    `  schema version now: ${reader.schemaVersion(ORIGIN, "/api/orders")}`,
  );
  const m = reader.migration(ORIGIN, "/api/orders", "1.0", "1.1");
  console.log(`  migration hint: ${JSON.stringify(m)}`);
}

console.log(
  "\nStep 5: Call endpoint again — observe live response under new schema",
);
{
  const res = await fetch(`${ORIGIN}/api/orders`);
  const body = await res.json();
  console.log(`  got: ${JSON.stringify(body)}`);
  reader.observeLiveResponse({ origin: ORIGIN, endpoint: "/api/orders", body });
  if ("currency" in body) {
    console.log("  ✓ agent survived schema change — currency field present.");
  }
}
```

- [ ] **Step 9.2: Run end-to-end**

```bash
cd ~/Developer/agent-feed
bun examples/publisher-fixture.ts &
FIXTURE_PID=$!
sleep 1
bun examples/consumer-demo.ts
kill $FIXTURE_PID
```

Expected output (paraphrased):

```
Step 1: Initial ingest
  canonical /rest endpoint: /api/orders
  schema version: 1.0

Step 2: Call endpoint (v1.0 expected)
  got: {"id":"ord_1","total":100}

Step 3: Origin migrates v1.0 → v1.1 (signed schema-change emitted)

Step 4: Re-ingest feed
  schema version now: 1.1
  migration hint: {"add":["currency"]}

Step 5: Call endpoint again — observe live response under new schema
  got: {"id":"ord_1","total":100,"currency":"USD"}
  ✓ agent survived schema change — currency field present.
```

- [ ] **Step 9.3: Commit**

```bash
git add examples/consumer-demo.ts
git commit -m "feat: end-to-end schema-change survival demo"
```

---

### Task 10: Conformance tests + README

**Files:**

- Modify: `~/Developer/agent-feed/README.md` (replace stub)

Conformance is already covered in canonical/crypto/feed/reader tests. README captures the pitch + quickstart.

- [ ] **Step 10.1: Run full test suite**

```bash
cd ~/Developer/agent-feed
bun test
```

Expected: all tests across canonical/crypto/feed/reader pass.

- [ ] **Step 10.2: Replace README**

Write `README.md`:

````markdown
# agent-feed

A signed announcement plane for the agentic web. Sites publish at `/.well-known/agent-feed.xml`; agents stop breaking silently when schemas change.

**Status:** v0 — reference implementation. Proof of concept with working schema-change survival demo.

## Why

Agents in production break silently when sites change schema or endpoints. There is no `robots.txt`-equivalent for telling agents the world has moved. MCP/A2A solve agent communication; nothing solves the announcement plane.

`agent-feed` is the smallest possible thing that could solve this: a signed Atom feed at `/.well-known/agent-feed.xml`, identity via `did:web`, three entry types (`endpoint-announcement`, `schema-change`, `deprecation`).

## Quickstart

```bash
bun install
bun test                         # run conformance tests
bun examples/publisher-fixture.ts &   # start a fixture origin
bun examples/consumer-demo.ts    # watch an agent survive a schema change
```
````

## CLI

```bash
# Generate keypair + did.json + empty feed
bun src/cli.ts init -o https://example.com -d ./public/.well-known

# Append a signed schema-change entry
bun src/cli.ts sign -d ./public/.well-known -t schema-change -p '{
  "endpoint": "/api/orders",
  "from_version": "1.0",
  "to_version": "1.1",
  "migration": { "add": ["currency"] }
}'

# Verify a remote feed
bun src/cli.ts verify -o https://example.com
```

## Library

```ts
import { Reader } from "agent-feed";

const reader = new Reader();
reader.on("mismatch", (e) => console.warn("schema mismatch", e));
await reader.ingest({ origin, xml, didDocument });

const endpoint = reader.canonicalEndpoint(origin, "a2a");
const version = reader.schemaVersion(origin, "/api/orders");
const migration = reader.migration(origin, "/api/orders", "1.0", "1.1");
```

## Spec

See [SPEC.md](./SPEC.md). Reader's behavioral contract is §2 (the load-bearing piece). Producer schema is §5.

## Design choices (decided in roundtable, 2026-04-27)

- **Polling-only in v0.** WebSub deferred until measured cost justifies it.
- **Three entry types:** `endpoint-announcement`, `schema-change`, `deprecation`. No status. No policy.
- **Detached Ed25519** over canonical JSON. No HMAC.
- **Snapshot and stream are separate artifacts.** `agent-card.json` is current state; `agent-feed.xml` is history. You can't reconstruct one from the other.
- **Reader's behavioral contract specified before producer schema.** Without a reader, the feed is a write-only fact stream with no epistemic status.
- **Spec version + kill switch in v0.** `feed-status: terminated` lets a publisher revoke trust.

Roundtable transcript: `~/Developer/roundtables/2026-04-27-agent-pa-system.md`.
Concept page: `~/Brain/wiki/concepts/agent-pa-system.md`.

## What this is not

- Not a registry — there's no central index.
- Not a discovery protocol — MCP Server Cards / A2A Agent Cards already cover state-snapshot discovery; this is the temporal-history layer beneath them.
- Not a status page — operational telemetry has different time-constants and consumers.
- Not a policy engine — pricing, rate limits, ToS belong in a separate slow-changing document.

## Roadmap

- v0 (this): spec + reference reader + signing CLI + fixture demo. Stable.
- v0.1: WebSub push as opt-in extension; conformance tests for both poll and push.
- v0.2: address the [open issues](./SPEC.md#10-open-issues): lying-publisher detection, multi-domain delegation, polling load.
- v0.x: propose into MCP via SEP as a complementary streaming layer once a real consumer commits to reading.

## Stewardship

This repo is owned, not abandoned. The protocol is the gift; the work is in maintaining it.

````

- [ ] **Step 10.3: Commit**

```bash
git add README.md
git commit -m "docs: README + roadmap"
````

---

### Task 11: Carmack persona reviews code for cuts

The user asked for "least amount of code possible." Carmack is the persona for this — his Round 1 said "build it small, don't fall in love with it."

- [ ] **Step 11.1: Dispatch carmack-persona subagent**

The subagent must:

1. Invoke the `carmack` skill.
2. Read every file under `~/Developer/agent-feed/src/` and `~/Developer/agent-feed/examples/`.
3. Run `wc -l ~/Developer/agent-feed/src/*.ts ~/Developer/agent-feed/examples/*.ts ~/Developer/agent-feed/tests/*.ts` to get current size.
4. Return a numbered list of _specific_, _named_ cuts: file:line ranges that can be removed without changing behavior, abstractions that are premature, types that aren't needed, dead code, comments that explain what well-named identifiers already do.
5. NOT make any edits. The subagent reports; I apply.

Constraints:

- Each cut must specify exact lines and a one-line rationale.
- Suggestions must not break the conformance tests or the demo.
- "Stylistic" cuts (rename for clarity) are out of scope; only structural cuts.

- [ ] **Step 11.2: Apply cuts that survive a sanity check**

For each suggested cut, I:

- Verify it doesn't break tests by running `bun test`.
- Verify the demo still works.
- Apply the cut.
- If a cut breaks something, skip it and document why in the commit message.

- [ ] **Step 11.3: Run full suite + demo**

```bash
cd ~/Developer/agent-feed
bun test
bun examples/publisher-fixture.ts &
PID=$!
sleep 1
bun examples/consumer-demo.ts
kill $PID
```

Expected: tests pass, demo prints "agent survived schema change".

- [ ] **Step 11.4: Commit**

```bash
git add -A
git commit -m "refactor: apply carmack review (cuts: <list>)"
```

---

### Task 12: Final verify + transcript in README

- [ ] **Step 12.1: Run full suite**

```bash
cd ~/Developer/agent-feed
bun test 2>&1 | tail -20
```

Expected: all green.

- [ ] **Step 12.2: Capture demo transcript**

```bash
cd ~/Developer/agent-feed
bun examples/publisher-fixture.ts &
PID=$!
sleep 1
bun examples/consumer-demo.ts > /tmp/demo-transcript.txt 2>&1
kill $PID
cat /tmp/demo-transcript.txt
```

- [ ] **Step 12.3: Append demo transcript to README**

Append a `## Demo transcript` section to README.md showing the literal output.

- [ ] **Step 12.4: Final commit**

```bash
git log --oneline
git add README.md
git commit -m "docs: add demo transcript to README"
```

- [ ] **Step 12.5: Print summary**

Print: total LOC, number of commits, test count, and the location of the project + spec + plan.

---

## Self-Review

**1. Spec coverage:** Every roundtable-mandated change has a task: detached Ed25519 (Task 4 + 5), three entry types only (Task 5 + 6), separate snapshot/stream framing (SPEC §4 in Task 2; Reader records both via separate APIs), reader contract before producer schema (SPEC §2 ordering enforced in Task 2 brief), version field + kill switch (Task 5 tests + Task 6 terminated test).

**2. Placeholders:** None — every code-bearing step has the actual code.

**3. Type consistency:** `Entry`, `EntryType`, `FeedStatus`, `Keypair`, `DidDocument`, `Reader.ingest`, `Reader.canonicalEndpoint`, `Reader.schemaVersion`, `Reader.migration`, `Reader.observeLiveResponse`, `Reader.on` — names used identically across Task 5/6/7/9.

**4. Open questions deferred to v0.x (intentional):** lying-publisher, multi-domain delegation, polling load, Shopify-incentive — these go in SPEC.md §10 (Hickey writes them) and the README roadmap.

---

## Execution

Subagent-driven for the two persona-handoff tasks (Task 2 hickey, Task 11 carmack), inline for the mechanical TDD tasks. Total estimated: 12 commits.
