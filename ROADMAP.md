# Roadmap

> Live document. Evergreen. Pruned, not appended.

## Principle

**Every addition pays interest. Default is no. Removals compound.**

The metric is _capability per line_, not LOC delta. A cut that loses a spec-mandated capability is wrong even if the diff is negative; an addition that earns its keep is right even when it grows the codebase.

The discipline: **before adding any feature, write its kill-criteria first.** If we can't name what would make us remove it, we don't add it.

This file is pruned, not appended. When a tier ships, its rows move from this document to `CHANGELOG.md`. When a bet is killed by reality, its row is deleted, with the kill noted in the commit message.

---

## Tier 1 — v0.1: close the loop (weeks, definite)

The smallest set of additions required for the protocol to be production-shippable, not just a reference impl.

| #   | Item                                                                                             | Why this earns its keep                                                                                                           | Kill criteria                                                                               | Cost                             |
| --- | ------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------- | -------------------------------- |
| 1   | **`agent-card.json` snapshot artifact** (SPEC §4 already specifies it; we only built the stream) | Without it, every consumer must replay the entire stream from genesis to learn current state. Spec MUST.                          | If we measure that consumers always replay anyway and the snapshot is unread for >6 months. | ~80 LOC, 1 day                   |
| 2   | **WebSub opt-in push** (Hickey held this; we deferred it)                                        | Schema changes happen rarely but matter immediately. Push avoids the polling smear (§2.10). Optional, conformance for both modes. | If, after 50 publishers, none enable push and consumers don't ask.                          | ~120 LOC, 2 days                 |
| 3   | **did:web key rotation** (SPEC §3.5 specifies it; we don't exercise it)                          | A v0 deployment with no rotation story is one compromise from total loss.                                                         | If everyone in practice runs single-key forever. (They won't.)                              | ~60 LOC + tests, 2 days          |
| 4   | **Conformance vectors as a separate artifact**                                                   | Test vectors that any implementer in any language can verify against. Makes ports cheap.                                          | If no second-language implementation appears within 6 months.                               | ~30 vectors as JSON files, 1 day |
| 5   | **`agent-feed lint <url>`** (CLI subcommand)                                                     | A publisher can self-check before going live. One command, full conformance report.                                               | If publishers ignore lint output and ship broken feeds anyway.                              | ~80 LOC, 1 day                   |
| 6   | **HTTP `Cache-Control` + `ETag` honored on the consumer side**                                   | Polling at scale needs conditional GETs or origins suffer. Spec §2.10 SHOULDs it.                                                 | If origins serve no caching headers and consumers don't measure.                            | ~20 LOC, 1 hour                  |

**Kill the whole tier if:** by 6 months from v0, fewer than 5 publishers have shipped a feed. The protocol failed to leave the lab. Don't double down; learn why.

---

## Tier 2 — v0.2: adoption substrate (months, conditional)

Friction-removers for the first 100 publishers. Shipped only after Tier 1 lands and at least one external publisher exists.

| #   | Item                                                                                                                                              | Why                                                                                                               | Kill criteria                                                     | Cost                           |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------- | ------------------------------ |
| 7   | **`@agent-feed/next`** — Next.js middleware that serves `did.json` + `agent-feed.xml` from build-time config                                      | Vercel/Next.js owns a huge slice of the web. Three lines in `middleware.ts` to publish.                           | If npm download counts stay <100/month after 3 months of release. | ~150 LOC, 2 days               |
| 8   | **`@agent-feed/fastapi`** — FastAPI dependency, same shape                                                                                        | Python's piece of the same surface.                                                                               | Same as #7.                                                       | ~80 LOC, 1 day                 |
| 9   | **`@agent-feed/cloudflare-worker`** — Worker that serves a feed signed by a Cloudflare-hosted KV-stored key                                       | Edge publishing without the publisher running infra.                                                              | If origins don't want managed signing.                            | ~120 LOC, 3 days               |
| 10  | **Hosted conformance checker at `agent-feed.dev/check?url=…`**                                                                                    | Anyone can paste a URL and get a graded report. Lowers debugging cost from "read 1190-line spec" to "fix line 3." | If <100 unique URLs checked in first 3 months.                    | ~300 LOC site + worker, 1 week |
| 11  | **Hosted aggregator** — service that ingests N feeds and exposes a query API ("which origins announced schema changes touching `/orders` today?") | This is the _defensibility wedge_ the roundtable identified. The format stays open; the aggregation has gravity.  | If <10 paying or actively-using clients in 6 months.              | ~600 LOC, 2-3 weeks            |
| 12  | **npm + JSR publish, semver hygiene, CHANGELOG**                                                                                                  | Standard package-manager presence. Without it, the lib doesn't exist for anyone outside the repo.                 | Never. (Mechanical.)                                              | ~1 day                         |

**Kill the whole tier if:** Tier 1 ships and adoption stays inside our own deployments after 6 months. The aggregator is the leading indicator — if it has zero readers, nothing downstream matters.

---

## Tier 3 — v0.3: standards posture (months, ambitious)

What makes this credible beyond a personal repo. Run only after Tier 2 produces external publishers we can cite.

| #   | Item                                                                                                     | Why                                                                                                                                           | Kill criteria                                                             | Cost                               |
| --- | -------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------- | ---------------------------------- |
| 13  | **IETF draft** (`draft-abdi-agent-feed-00`)                                                              | Standards bodies are the only path to the kind of adoption robots.txt has.                                                                    | If draft sits at -00 with zero reviews after 12 months.                   | ~1 week to write, then ongoing     |
| 14  | **MCP SEP** proposing `agent-feed` as the streaming layer beneath MCP Server Cards                       | Direct shot at being subsumed _into_ the winning protocol instead of competing with it. R2 convergence: snapshot ≠ stream, both should exist. | If MCP TC explicitly rejects the SEP. (Then we know.)                     | ~3 days, then dialogue             |
| 15  | **A2A extension** for change-announcement semantics over Agent Cards                                     | Same play, different protocol. Hedges the MCP bet.                                                                                            | Same as #14 for A2A.                                                      | ~3 days                            |
| 16  | **Cross-language reference readers**: Rust, Python, Go                                                   | Standards die without ≥3 independent implementations. Each is a thin glue around the algorithm.                                               | If first two languages ship and the third has no contributor in 6 months. | ~200 LOC each, 1 week per language |
| 17  | **Formal model in TLA+ or Alloy** for the reader contract                                                | The reader contract is the load-bearing piece (§2). Formal verification catches edge cases the test suite misses.                             | If model-checking finds nothing in 100 hours of CPU.                      | ~1 week                            |
| 18  | **Test corpus from real-world feeds** — checked-in feeds from N actual origins, used as regression tests | Lab feeds are too clean. Real ones have weird Atom dialects, weird canonicalization, weird key rotation.                                      | Never; the corpus only grows.                                             | Ongoing                            |

**Kill the whole tier if:** by month 18 we cannot name a single major-provider engineer (Anthropic / Cloudflare / Vercel / Google / Microsoft) who has read the spec and engaged. Without that channel, IETF and SEPs are theater.

---

## Tier 4 — v1.0+: the ambitious realities

The bets. Not roadmap items — directional reality-claims about what this protocol could mature into. Each has a kill-criterion.

### 4.1 The temporal layer of the agentic web

If agent-feed reaches 10k publishers, every API change the open web makes has a signed, timestamped record. When an agent breaks, you grep history. When regulation demands audit ("what did the merchant claim at the moment the agent acted?"), you have it.

**The bet:** the agentic web's git log.
**Kill if:** at 1k publishers, query volume on the aggregator stays below 1 query / publisher / month. Nobody actually wants the history; they only want current state. Tier 1 #1 (snapshot artifact) ate the value alone.

### 4.2 Trust substrate for agent payments

x402, Mastercard's "Agent Pay," Lobster, the Coinbase delegation work — they all need a way to answer: "what schema was in force at moment T?" An immutable signed feed is the answer.

**The bet:** agent-feed becomes the dispute-resolution evidence layer for agent commerce.
**Kill if:** payment networks ship their own private change-logs (likely) and never read the public version.

### 4.3 Cross-protocol convergence

If MCP _and_ A2A both adopt agent-feed as the change-history sublayer, the protocol war stops mattering for the change dimension. Agents become protocol-agnostic because the meta-layer is shared.

**The bet:** the lingua franca for _change_, regardless of the protocol carrying _the thing_.
**Kill if:** by v0.3 #14/#15, both protocols choose to bake their own change-stream instead of adopting ours. (Probable; we should be ready.)

### 4.4 The public deprecation ledger

Right now, sites quietly kill APIs. With agent-feed, deprecation is on-record: announcement-at, sunset-at, replacement, who signed it. A public ledger of who deprecated what, when, and how much notice they gave.

**The bet:** accountability infrastructure for the agentic economy. Reputation accrues to publishers who deprecate cleanly; flows away from publishers who don't.

This is also our path to the spec's §10.5 lying-publisher problem: not by detecting lies in any one feed, but by accumulating _cross-feed reputation_ over signed history. A publisher who routinely emits inaccurate migrations gets noticed across all aggregators that consume their feed. Ed25519 proves origin; reputation proves _truth_. The protocol stays neutral; aggregators do the scoring.

**Kill if:** at 1k publishers, reputation deltas across aggregators show no correlation with each other. The signal isn't real.

### 4.5 The 404-killer

When an agent hits a moved endpoint, instead of a 404 it gets the deprecation entry pointing to the replacement. The 404 — the web's oldest failure mode — becomes a recoverable error for any agent that subscribes.

**The bet:** make the agentic web _more reliable than the human web_, by virtue of its publishers being machine-readable about their own changes.
**Kill if:** publishers don't bother announcing endpoint moves even with the protocol available.

### 4.6 IDE + browser integration

A VS Code extension that reads `agent-feed.xml` for every domain your code calls. At save-time, it warns: "you call `https://api.shopify.com/orders` — they announced a `currency` field 3 days ago; your code doesn't read it."

A browser extension (Arc, Brave, eventually Chrome) that surfaces feed entries on sites you visit: "this site changed its API last Tuesday; here's the migration."

**The bet:** humans become aware of API churn the way they're aware of CVEs. Agent-feed leaks from agents back into developer ergonomics.
**Kill if:** developers ignore the warnings and ship broken integrations anyway. (Likely. But cheap to test.)

### 4.7 Time-travel debugging for agents

An agent that broke at 3am can be re-run against the feed-as-of-2:55am to reproduce. Agent-feed entries are timestamped, signed, immutable — perfect substrate for deterministic replay. Combine with a per-agent transcript log and you have something close to `git bisect` for agent failures.

**The bet:** agent-feed becomes the time-machine layer for agent-debugging. Comes for free if §4.1 holds.

### 4.8 ML training corpus

Aggregated feeds across the web are a labeled dataset of API evolution: "this is how schemas mutate over time." Train a model on this, and you have a system that can _predict the migration delta for an unannounced change_. Agents become resilient to API changes that _no publisher announced_ — by inference from the population.

**The bet:** the protocol's data exhaust becomes the training substrate for the next generation of robust agents.
**Kill if:** at scale the dataset is too noisy or too publisher-skewed to train usefully.

### 4.9 Regulatory wedge

EU DSA and successor agentic-AI regulations will require some form of "change disclosure" for services accessed by autonomous systems. A signed, public, immutable history of how a service has evolved is exactly that. Being the protocol that already solves it when regulation lands is leverage.

**The bet:** what looks like volunteer infrastructure today becomes mandatory infrastructure in 3-5 years. We sit at the right place in the stack.
**Kill if:** regulation moves toward proprietary disclosure mechanisms instead.

### 4.10 The agentic web's archive.org

Long-term archive of every `agent-feed.xml` from every origin, signed and timestamped. Archive.org for the _machine-readable_ web. The archive becomes a public good, possibly nonprofit-stewarded.

**The bet:** the persistent record of how the agentic web evolved, accessible 30 years from now.

---

## Cross-cutting: discipline rules

These apply to every tier. They are ours, not the spec's.

1. **Kill-criteria before code.** No feature merges without a one-sentence kill-criterion in its commit message.
2. **Quarterly prune.** Every 3 months, walk this file. Any item whose kill-criterion is met is deleted (not crossed out). Any item with no movement and no kill is moved to "frozen."
3. **The spec is sacred. The implementation is disposable.** If a spec change becomes necessary, it requires a roundtable; if an implementation change becomes necessary, it requires only tests.
4. **Removal counts as ship.** Deleting a 200-line feature that nobody used is a release-worthy event. Note it in the commit message; cite the kill-criterion that fired.
5. **No feature added because it would be cool.** Every addition cites the user demand or the spec MUST that justifies it. Cool is not enough.
6. **The CLI surface stays at three commands.** `init`, `sign`, `verify`. New verbs require unanimous case for them; subcommands of existing verbs are preferred. (Per Hickey's "decomplect" principle.)
7. **The library API stays small.** New top-level exports require a kill-criterion for _the export_, not just the feature. Internal helpers are free.

---

## Open question (held permanently)

**What kills agent-feed entirely?** Three plausible scenarios:

- **Subsumption.** MCP Server Cards Q3 2026+ ships streaming + immutable history with snapshot/stream separation. We pivot to writing the test corpus they consume, then sunset.
- **Vendor consolidation.** AWS / Cloudflare / Azure all converge on the same private-but-mutually-compatible scheme. Open-protocol play loses by network effect. We pivot to documenting their convergence and stewarding the open subset.
- **Indifference.** 18 months in, fewer than 100 publishers, no major engineer engaged. The protocol solved a problem nobody had urgently enough. We archive the repo with a "lessons" post-mortem and move on.

If any of these fires, we don't add features. We sunset gracefully.
