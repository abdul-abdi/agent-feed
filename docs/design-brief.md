# agent-feed — design brief

For the designer (or AI-design tool) producing landing pages and UI mockups. Hand this whole document over.

---

## What this project is

**agent-feed** is two things that compose into one product:

1. **A signed protocol** for sites to tell agents that something has changed about their machine-readable surface — schema migrations, deprecations, canonical endpoint moves. Think `robots.txt` + DKIM + RSS, designed for autonomous agents instead of crawlers or humans. Lives at `/.well-known/agent-feed.xml`, signed via `did:web` + Ed25519.

2. **A search engine for the agentic web** that crawls the existing fragmented standards (MCP registry, A2A registry, GitHub README catalogs) and, _most importantly_, **detects when those sources disagree about the same agent endpoint.** That cross-source disagreement is the headline product — the agent operator is the only consumer that crosses sources.

The two halves connect: when the search engine finds disagreements about your origin, it offers you a **draft signed feed entry** to publish. The dashboard _is_ the publisher conversion mechanism. No bots, no outreach.

## The one-line pitch

**The agentic web's git log — and the place to see how it disagrees with itself.**

## The problem in one paragraph

In 2026, agent endpoints are described across at least N standards: MCP server registry, A2A agent cards, agents.json, agents.txt, OpenAPI manifests, llms.txt, and a half-dozen GitHub README catalogs. They disagree. They drift. When an API mutates underneath an agent that depends on it, the agent breaks silently — there is no `robots.txt`-equivalent for telling agents the world has moved. MCP and A2A solved how agents _talk_. Nothing solves how the world _announces it changed_. This project is that announcement layer, plus a public observatory of the existing ecosystem's disagreements.

## Who lands on this site

In priority order:

1. **Agent operators / developers** — building on MCP, A2A, custom agent stacks. They want to know which endpoints they depend on, what's drifted, what's deprecated. _They are the user of the drift dashboard._
2. **Origin operators** — people who run MCP servers, A2A agents, or any service exposing machine-readable agent metadata. They want to see how the public world describes their service and how to make their description authoritative. _They are the conversion target._
3. **Standards / protocol people** — IETF, W3C-curious, open infrastructure folks. They want the spec, the IETF draft, the MCP SEP. _They are the credibility audience._
4. **Security / trust / journalism researchers** — they want the cross-source disagreement signal for their own purposes. _They are the high-leverage long-tail._

Design primarily for #1 and #2. #3 reaches the spec page from a single deep link.

## Voice and tone

- **Honest, terse, technical.** Not "revolutionary." Not "AI-powered." Not "the future of." Say what it does and what it doesn't.
- **Show, don't tell.** Every claim is followed by a concrete example or a live data point.
- **Push back on hype.** The README explicitly downgrades training-data claims to "fine-tuning data for niche tasks." That voice should be felt on the homepage too.
- **Confident in scope, humble about reach.** It's a layer, not a runtime. It's not where the web "lives."

The tone reference: small standards-body work (RFCs, W3C TR docs), Hickey talks, Stripe API docs, what robots.txt would feel like if it had a homepage. Not a SaaS marketing site.

## Visual reference points

- **Terminal-aesthetic, dense, monospaced.** The existing dashboard at `apps/corpus/public/index.html` is a starting point — JetBrains-Mono, dark background, limited palette (one accent green, one warning amber, one divergence red, one signed-blue). You can refine but should not abandon this aesthetic. The audience reads code; the site should feel like it was made by someone who reads code.
- **Information density over whitespace luxury.** Real content per pixel. No giant hero graphics with three-word taglines.
- **Sharp visual distinction between two trust planes** — _signed_ (cryptographic, blue/green) vs _observed_ (third-party, red/amber, always tagged "UNSIGNED"). This distinction is doctrinal and must be visible everywhere both planes appear.
- **Diff/divergence as a first-class visual primitive.** Side-by-side per-source values for the same field. Red border or red field-name on disagreement rows.
- **No stock illustrations of robots, neural nets, or holograms.** None.

Suggested palette (tweak as needed):

```
bg            #0b0d10
fg            #e6e6e6
muted         #888888
accent green  #7ee787   (signed-good, confidence-high, success)
warn amber    #f0b232   (medium confidence, partial info)
diverge red   #ff6b6b   (cross-source disagreement, UNSIGNED)
signed blue   #58a6ff   (signed-protocol indicator)
card          #14181d
border        #232a31
```

Typography: `ui-monospace, "JetBrains Mono", "SF Mono", Menlo, monospace` for body and headings both. Maybe one display weight for the homepage hero.

## Surfaces to design

### 1. Homepage — `agent-feed.dev` _(new)_

Goal: in 5 seconds, a developer understands what this is, why they care, and clicks one of two CTAs.

**Above the fold, in this order:**

- One-liner: **"The agentic web's git log — and the place to see how it disagrees with itself."**
- One paragraph: the problem (schema drift breaks agents silently; nothing is `robots.txt` for agents; the world has fragmented standards that disagree).
- Two CTAs side by side:
  1. **"Drift check any agent endpoint →"** — links to `/dashboard` (the drift dashboard).
  2. **"Read the v0 spec →"** — links to the rendered SPEC.md.
- A live counter or strip showing real numbers ingested today: _"2,787 observations · 3 sources · 1 cross-source divergence detected (and counting)."_ These numbers should pull from `/api/corpus/counts` if the homepage is dynamic, or be statically updated.

**Mid-page sections** (in priority order):

1. **A live divergence example, rendered.** Show the actual `Auctalis/nocturnusai` divergence — paste it into a fake card showing the two source values disagreeing on the same field. Caption: _"This is real. Same server, two stories. The publisher doesn't see this because no publisher reads themselves through a third-party index."_
2. **"Two artifacts, two URLs"** — explain the snapshot (`agent-card.json` = current state) vs. the stream (`agent-feed.xml` = history) split. A simple two-column visual works. This is doctrinal and the design must surface it.
3. **"How it composes with what you already have"** — small grid showing logos / badges for MCP, A2A, ANP, OpenAPI. Caption: _"Not a competitor. The change-history layer beneath them."_
4. **The conversion path for publishers.** A 4-step illustration:
   `paste origin → see what the world says about you → review draft signed entry → publish at /.well-known/agent-feed.xml`
5. **Implementation status** — checkmarks. _"v0 spec (1190 lines) ✓ · TS + Python libs ✓ · Next.js / FastAPI / Cloudflare Worker adapters ✓ · drift dashboard ✓ · IETF draft submitted as draft-abdi-agent-feed-00 ✓ · MCP SEP filed ✓"_ These are real, today.
6. **Skeptical-FAQ-style footer.**
   - "Why not just use MCP Server Cards?" → because snapshots ≠ streams. _(actual answer in the SEP)_
   - "Are you scraping my site?" → robots.txt-respecting, schemas-only, opt-out endpoint at `/api/corpus/optout`.
   - "Is this trying to be the entire agentic web?" → no. We're the change-history layer. The web doesn't live in DNS; we don't either.
   - "Why should I sign feeds?" → because once one of your dependents is an agent, your silent migrations cost them money.
   - "Who's behind this?" → independent. MIT-licensed. The roundtable transcripts are in the repo.

The homepage should _not_ have:

- A pricing page or pricing hint.
- A "Get Started for Free" button.
- Customer logos we don't have.
- A founder photo.
- Any animation that doesn't carry information.

### 2. Drift dashboard — `agent-feed.dev/dashboard` _(redesign of existing UI)_

Already implemented at `apps/corpus/public/index.html`; the designer should refine, not redo from scratch. Keep the flow:

1. **Hero strip:** counts across sources (`mcp-registry`, `a2a-registry`, `github-readme`), total observations, last-crawl timestamp.
2. **Single input field:** "paste a GitHub repo, an A2A wellKnownURI, or any origin." The placeholder text should make all three valid inputs obvious. An example link below activates the canonical demo.
3. **Result panel** shows in this order:
   - **Origin header** — large, with a "X observations across N sources" badge.
   - **Divergence panel** _(only if there are divergences)_ — bordered red, with field-level rows. Each row has the field name on the left, then a stack of per-source values. Each value carries its source pill.
   - **Per-source observation cards** — one per source, each tagged with a colored source pill AND a bold red `UNSIGNED` pill (always — this is doctrinal, never quiet, never optional). Show name, description, version, protocolVersion, endpoints. Collapsible "raw record" detail.
   - **Conversion CTA card** — "Operate this origin? Make it authoritative." 4-step copy-pasteable signing flow with a draft payload pre-filled from the highest-priority observation. Confidence pill (`high` / `medium` / `low`) on the card.
4. **Search box** — full-text across the corpus. Optional, can be on a sub-page.

The visual job for the redesign: make the divergence panel feel like the headline of the page when present, and make the unsigned tagging unmissable on every observation card.

### 3. Aggregator search UI — `agent-feed.dev/search` _(de-emphasize, exists but no signed publishers yet)_

Already exists at `apps/aggregator/public/index.html`. Search across signed feeds. Currently has zero entries because zero external publishers exist yet. The design should reflect that honestly: an empty state that says _"No signed feeds indexed yet. The aggregator becomes meaningful as origins start publishing. In the meantime, see the [drift dashboard]."_

### 4. Spec viewer — `agent-feed.dev/spec` _(new, low priority for first design pass)_

A clean rendering of `SPEC.md` (1190 lines), with section navigation. The IETF draft (`docs/IETF-DRAFT.md`, 2691 lines) and MCP SEP (`docs/MCP-SEP-agent-feed.md`) get sibling pages. This is for protocol people; design should match modern RFC viewers (kramdown-rfc renderers, ietf.org diff-friendly typography).

### 5. CLI / library quickstart — `agent-feed.dev/docs` _(new, minor)_

A dense one-pager: `bun install`, the three CLI commands (`init` / `sign` / `verify` / `lint` / `snapshot`), the library API, the three publisher adapters. No multi-step tutorial — just the commands and code blocks the developer can copy.

## Concrete UX scenarios to design for

### Scenario A: The agent operator who hit a 404

A developer's agent tried to call `https://api.example.com/v1/orders` and got a 404. They paste `https://api.example.com` into the dashboard. The dashboard shows:

- One observation from the MCP registry, last seen 3 days ago, listing `endpoint: /v1/orders, version: 1.0`.
- One observation from a GitHub README, listing the same endpoint.
- No signed feed.

The dashboard's value: this developer learns the registry is stale and there's no authoritative migration record. The CTA invites the _origin operator_ (not this developer) to publish a signed feed. This developer files an issue against the origin's repo with the dashboard URL.

### Scenario B: The MCP server maintainer who never thought about this

The maintainer of `Auctalis/nocturnusai` is shown the dashboard URL by a user. They paste their own repo and see two stories about themselves. **This is the conversion event.** The CTA shows them a copy-pasteable signing flow. They go from "what's this random tool" to "my repo has a publishing surface" in three commands.

The design should treat this scenario as the highest-leverage flow on the entire site. Make the CTA card _exciting_ in a way that doesn't feel like a sales page — like the moment you discover `git status` has been telling you something useful all along.

### Scenario C: The IETF / MCP TC reviewer

They land via a link from a GitHub issue or a mailing list. They want the spec immediately. The homepage should give them a one-click path to `/spec` that doesn't require parsing any marketing copy. A small, stable nav-link is enough.

## What to make visible vs invisible

**Always visible:**

- The trust-property distinction (signed vs observed). Color-coded. Pilled. Never an afterthought.
- The "this is unsigned" tag on every observed entry. Every card. Every list row.
- Source attribution. Where did this row come from? Always, always answerable.
- The opt-out path. A footer link to `/api/corpus/optout` and instructions for origin operators.

**Visible on demand (collapsed/secondary):**

- The full raw record (one-click expand).
- The crawl provenance (when, from what URL).

**Should not be visible:**

- Numerical hype ("trusted by 10,000 developers" — we have zero).
- Implementation internals on the homepage (FTS5, SQLite, Bun — these are great in the spec/docs page, not on the front).
- Generic AI imagery.
- Anything that suggests the corpus is signed-grade. The whole architectural commitment is that it isn't.

## Anti-patterns to avoid

- **Treating signed and observed as a quality gradient.** They are different _kinds_ of facts. Hickey's metaphor: signed is testimony, observed is a photograph. Design must reflect this.
- **Making the conversion CTA feel like marketing.** It should feel like a developer tool noticing something useful for you. Imagine `git push` printing "you have unmerged conflicts" — that helpful, that unobtrusive.
- **Designing as if this were a SaaS.** It's a protocol with a public observatory. There's no signup, no billing, no team-management dashboard. It's `agent-feed.dev`, not `app.agent-feed.dev`.
- **Adding a "Try AI" button anywhere.** No.

## Real numbers and live state to use in mockups

These are honest and current:

- **2,787** observations indexed, across 3 source adapters.
- **500** MCP registry servers ingested.
- **50** A2A registry agents.
- **2,237** GitHub README entries from `punkpeye/awesome-mcp-servers` + `modelcontextprotocol/servers`.
- **1** confirmed cross-source divergence on real data: `https://github.com/Auctalis/nocturnusai`, fields `name` and `description` disagree across `mcp-registry` and `github-readme`.
- **78** tests passing across the project.
- **Zero** external signed-feed publishers (the v0 protocol shipped 2026-04-27; corpus dashboard shipped 2026-04-28).

For the live divergence card on the homepage, use the actual values:

- README says: name `"Auctalis/nocturnusai"`, description `"Deterministic reasoning engine for AI agent context compression. Extracts structured facts with logical inference, proof chains, and truth maintenance."`
- Registry says: name `"ai.nocturnus/logic-server"`, description `"Agent reasoning, memory, and token-optimized context for AI applications."`

Same server. Two stories. That's the page.

## Existing artifacts the designer should look at before starting

1. `apps/corpus/public/index.html` — the working drift dashboard. The design vocabulary for the rest of the site should grow from here.
2. `apps/aggregator/public/index.html` — the working signed-feed search UI.
3. `README.md` — the project's voice, in long form.
4. `SPEC.md` — section ordering is deliberate (reader contract before producer schema). The site's information ordering should respect this principle (consumers before producers, divergence before observation, observation before pitch).
5. `ROADMAP.md` and `CHANGELOG.md` — what shipped, what's deferred, with kill criteria. These are public; the design should be willing to surface them honestly.
6. `~/Developer/roundtables/2026-04-27-agent-pa-system.md` and `~/Developer/roundtables/2026-04-27-agent-corpus-scraper-plane.md` — the two roundtables that produced the architecture. Optional reading for the designer; mandatory for understanding why the trust-plane separation is doctrinal.

## What I want back from the design pass

In rough priority:

1. **Homepage** — desktop + mobile, with the live divergence card prominent, the two-CTA hero, and the publisher conversion path.
2. **Drift dashboard refinement** — same flow as exists, refined typography, divergence panel as headline, unsigned tagging more prominent.
3. **Empty state for the aggregator search** — honest about zero signed publishers, points back to the dashboard.
4. **A simple `/spec` page** — RFC-style rendering with sticky section nav.

Color tokens, type scale, spacing scale, component primitives (cards, pills, code blocks, diff rows) are welcome as a small design-system note alongside the layouts.

## What I'll do after you hand designs back

I'll implement them in `apps/corpus/public/` and a new `apps/web/` for the homepage and spec viewer, in the same Bun + vanilla-JS-or-light-framework stack. No build pipeline beyond what already exists. Plain HTML/CSS that respects the design tokens you give me.

Bring me the layouts. I'll bring you the working site.
