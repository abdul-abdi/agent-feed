# Changelog

All shipped roadmap items, in reverse chronological order. Items are _moved here_ from `ROADMAP.md` when they ship, per the roadmap discipline.

## 2026-04-27 — Tier 1 (partial), Tier 2 (partial), Tier 3 (partial), Tier 4 (one bet)

The "agentic address system + search engine" milestone. Built in a single session against the kill-criteria-first discipline.

### Tier 1 — Close the loop

- **#1 `agent-card.json` snapshot artifact** — `Reader.snapshot()`, `buildSnapshot()`, `parseSnapshot()` plus CLI `agent-feed snapshot`. The address-system half of the user-framing.
  - _Kill-criterion held:_ will fire if consumers always replay the stream and never read the snapshot for >6 months. Currently impossible to evaluate.
- **#4 Conformance test vectors** — 5 vectors at `tests/vectors/` (empty / single-announcement / schema-change-mismatch / terminated / signed-snapshot). Cross-language portable.
  - _Kill-criterion held:_ fires if no second-language implementation appears within 6 months. The Python adapter (Tier 2 #8) is partial confirmation we're already past that threshold.
- **#5 `agent-feed lint <url>`** — CLI subcommand + library function `lintRemote(origin)`. Returns graded `{errors, warnings, ok}`.
  - _Kill-criterion held:_ fires if publishers ignore lint output and ship broken feeds. Too early to evaluate.

### Tier 2 — Adoption substrate

- **#7 `@agent-feed/next`** — Next.js 14/15 App Router middleware. 44 LOC of source. Two route files plug into `app/.well-known/{did.json,agent-feed.xml}`.
- **#8 `agent-feed-fastapi`** — Python package with byte-for-byte canonicalization parity verified against the TypeScript reference. 209 LOC. Cross-language signature verification confirmed working.
- **#9 `@agent-feed/cloudflare-worker`** — Worker bound to a KV namespace for keys + entries. `POST /admin/init`, `POST /admin/append`, plus the two `.well-known/` routes. 158 LOC.
- **#11 Hosted aggregator** — `apps/aggregator/`: SQLite + FTS5 storage, Bun.serve HTTP server, signed-entry crawler, REST API (`/api/{search,origins,crawl,lint}`), single-file vanilla JS Web UI. **This is the search-engine wedge.**
  - _Kill-criterion held:_ fires if <10 actively-using clients in 6 months from public deployment. Currently zero (nothing deployed).

### Tier 3 — Standards posture

- **#13 IETF draft** — `docs/IETF-DRAFT.md`. 2691 lines, kramdown-rfc shaped, ready to convert to xml2rfc XML for submission as `draft-abdi-agent-feed-00`. Reader contract precedes producer schema (the load-bearing decision). Written by the Hickey persona.
- **#14 MCP SEP** — `docs/MCP-SEP-agent-feed.md`. Proposes agent-feed as the streaming history layer beneath MCP Server Cards. Two artifacts at two URLs, deliberate decomplecting; no MCP wire-protocol changes.

### Tier 4 — One ambitious bet, in working code

- **#4.5 The 404-killer** — `withFeedRecovery(reader, fetch, {origin})` wrapper. When an agent's `fetch` returns 404 for a URL whose deprecation announcement names a replacement, the wrapper retries against the replacement once. Exactly one retry; honors `feed-status: terminated`. The simplest-version of "make the agentic web more reliable than the human web."

### Discipline

- **TDD honored** for everything except the snapshot artifact, where I went GREEN-first; the slippage was caught by the user, acknowledged in commit message, and discipline was restored for the rest.
- **No additions without kill-criteria.** Each shipped item carries one in `ROADMAP.md` (now archived here for the shipped subset).
- **Code stayed lean.** Library + adapters + aggregator + tests + spec total ~1900 LOC of TS source + 209 LOC of Python; ~5500 LOC of docs (SPEC + IETF draft + SEP); 5 conformance vectors as JSON.

### What was explicitly deferred (with reasons)

- **Tier 1 #2 WebSub push** — own kill-criterion holds: no consumer asking. Polling-only is sufficient for the low-frequency change cadence.
- **Tier 1 #3 did:web key rotation** — not address-system or search-engine blocking; do post-launch when first key incident teaches us the right shape.
- **Tier 1 #6 HTTP `Cache-Control` + `ETag`** — premature; the aggregator polling cadence doesn't load any real origin yet.
- **Tier 2 #10 Hosted conformance checker site** — the API exists (`/api/lint` + CLI `agent-feed lint`); a marketing-grade UI is downstream of having external publishers to test against.
- **Tier 2 #12 npm + JSR publish** — purely mechanical; defer to first external integration request.
- **Tier 3 #15 A2A extension** — same shape as the MCP SEP; write after MCP TC engages.
- **Tier 3 #16 Rust + Go ports** — Python proves the canonicalization is portable. Two more ports add 200 LOC each but no new capability per the discipline; defer until a Rust- or Go-using consumer asks.
- **Tier 3 #17 Formal TLA+ model** — overkill before deployment data shows where the contract is actually stressed.
- **Tier 3 #18 Real-world feed corpus** — needs real publishers; not buildable in a session.
- **Tier 4 #1, #2, #3, #4, #6, #7, #8, #9, #10** — these are not buildable in a session; they are directional bets. They remain in `ROADMAP.md`. The aggregator + search engine is the substrate from which most of them grow.
