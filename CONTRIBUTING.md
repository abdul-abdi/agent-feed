# Contributing

Thanks for considering contributing. This project is small, opinionated, and protocol-shaped — please read this whole page before opening an issue or PR.

## Before you start

- Read the relevant doctrine page first. The most common conflict in PRs is a change that violates one of the two doctrinal commitments:
  1. **Snapshot ≠ stream.** `agent-card.json` and `agent-feed.xml` are different artifacts. Don't fold them.
  2. **Signed ≠ observed.** Storage may join, surfaces never blur. The `provenance` field is NOT NULL and load-bearing.
- Read [SPEC.md](./SPEC.md) for protocol changes.
- Read [ROADMAP.md](./ROADMAP.md) for what's deferred and why. Many "good ideas" are in the deferred list with explicit kill-criteria.

## Issues

We welcome:

- Bugs (use the bug template)
- Spec clarifications (use the feature template; tag with `spec`)
- Adapter requests (Rust / Go / etc.)
- Real-world feed examples we should include in the conformance corpus

We do NOT welcome:

- "Add a feature flag for X" without a kill-criterion
- "Could you also support Y" where Y is in the [out-of-scope](./SPEC.md#9-out-of-scope-v0) section of the spec
- Generic AI-content suggestions

## Pull requests

- **Run the tests.** `bun test` — should be 78/78 green before you push.
- **Run typecheck.** `bunx tsc --noEmit`.
- **TDD where applicable.** New behavior gets a failing test first. The repo's commit history shows what this looks like in practice.
- **Spec changes require a roundtable.** The two architecture roundtables (in `~/Developer/roundtables/`) shaped the design. Material spec changes should be discussed before code — open an issue first.
- **Don't add a feature without writing its kill-criterion.** Per the [ROADMAP discipline](./ROADMAP.md), every addition pays interest. If you can't say what would make us remove it, we don't add it.
- **Keep PRs small.** One commit per logical change. Use the conventional-commits style we use (`feat:` / `fix:` / `docs:` / `refactor:` / `test:`).

## Local development

```bash
bun install
bun test                                    # 78 tests, ≤200ms

# end-to-end demo (no internet required)
bash scripts/full-demo.sh

# all three apps:
PORT=4300 SEED=1 DB_PATH=/tmp/c.sqlite bun apps/corpus/src/server.ts &
PORT=4200          DB_PATH=/tmp/a.sqlite bun apps/aggregator/src/server.ts &
PORT=4100                               bun apps/web/src/server.ts &

# build the static Pages bundle
bun scripts/build-site.ts                   # outputs dist/
```

## Code style

- TypeScript, strict, no `any` unless necessary at a boundary.
- 4-space indentation in Markdown lists, 2-space in JS/TS (Prettier defaults).
- Comments: only when _why_ is non-obvious. Don't paraphrase the code in comments.
- `// TODO` is fine; `// XXX` and `// FIXME` aren't (they rot).

## Repo principles (from the architecture roundtables)

These won't change without another roundtable:

- The reader's behavioral contract is specified before the producer schema.
- The protocol is signed-only.
- The corpus is observed-only.
- Storage may join, surfaces never blur.
- Per-field reconciliation is the load-bearing operation.
- Cross-source divergence is the headline product.
- No autonomous PRs against third-party repos.
- Schemas-only fetching, no full-text bodies, robots.txt-respecting.

## License

By contributing, you agree your contributions are licensed under [MIT](./LICENSE).
