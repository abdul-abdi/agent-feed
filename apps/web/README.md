# agent-feed-web

The marketing surface — homepage and (planned) spec viewer. Built faithfully from the Claude-design handoff at `docs/design-brief.md`.

## Run

```bash
PORT=4100 bun apps/web/src/server.ts
# open http://localhost:4100
```

The homepage graceful-enhances its counter strip by fetching `http://localhost:4300/api/corpus/counts` (the corpus app). If the corpus app is running and CORS-permissive, counters update from real data. If not, it falls back silently to the design's static numbers (2,787 / 500 / 50 / 1).

To enable live counters end-to-end, run all three apps:

```bash
PORT=4200 DB_PATH=/tmp/agg.sqlite      bun apps/aggregator/src/server.ts
PORT=4300 DB_PATH=/tmp/corpus.sqlite SEED=1 bun apps/corpus/src/server.ts
PORT=4100                              bun apps/web/src/server.ts
```

## What's here

| File                | Purpose                                                                                                                                |
| ------------------- | -------------------------------------------------------------------------------------------------------------------------------------- |
| `public/tokens.css` | Shared design tokens (verbatim from the design handoff).                                                                               |
| `public/index.html` | Homepage. Hero with divergence-as-headline + counters + doctrine + composition + conversion path + scenarios + status + skeptical FAQ. |
| `src/server.ts`     | Tiny static host. No build step.                                                                                                       |

## Sibling pages (not yet built — planned per design handoff)

The homepage links to:

- `dashboard.html` — drift dashboard (already implemented at `apps/corpus/public/index.html` on port 4300; the web app's `/dashboard.html` link will 404 here for now).
- `search.html` — aggregator empty state (planned).
- `spec.html` — RFC-style SPEC.md viewer (planned).
- `docs.html` — CLI / library quickstart (planned).

When you're ready to redesign or implement the sibling pages, the design package has them as siblings in the same handoff — copy them into `apps/web/public/` and they'll just work alongside the homepage.

## Notes

- No build pipeline. Plain HTML/CSS/inline JS. Edit and reload.
- The prototype's React tweaks panel (hero variant / density toggles from the design tool) is intentionally **not** copied — that was design-time scaffolding, not a production feature.
- The "live divergence" hero card uses the actual values for `github.com/Auctalis/nocturnusai` (the same divergence the corpus app surfaces today).
