<!-- PRs that change the spec require a roundtable first. Open an issue. -->

## Summary

<!-- What changed and why, in 1-3 sentences. -->

## Doctrine check

- [ ] Doesn't fold snapshot and stream into one artifact
- [ ] Doesn't fold signed and observed into one trust plane
- [ ] If it adds a feature, the commit message contains a kill-criterion

## Verification

- [ ] `bun test` passes (78+/78+)
- [ ] `bunx tsc --noEmit` clean
- [ ] If the change affects the dashboard or homepage: ran `bun scripts/build-site.ts` and verified `dist/` renders

## Notes

<!-- Anything reviewers should pay attention to. -->
