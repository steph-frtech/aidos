# step-verifier — recurring patterns index

- [Executor report file-path drift](report-path-drift.md) — executor reports list plausible-but-wrong frontend paths; always glob/ls the real tree, do not trust the report's file list.
- [Frontend lib twin location](frontend-lib-twin.md) — Workbench pure twins live at front/web/lib/<name>.ts(+.test.ts), not in app/<route>/; vitest include is lib|app|components **/*.test.ts.
- [Playwright runs from repo root](playwright-runs-from-repo-root.md) — e2e specs + config at repo root; run `npx playwright test <name>.spec` from /data/dev/aidos, never front/web (bare filter can hit the vitest twin).
- [Verify emitter determinism](verify-emitter-determinism.md) — for codegen/emitter steps (S34, S36-S38): re-run materialize + assert zero git diff on gen/ dirs proves byte-stability; twin must sort fields before hashing.
- [Gate conjunct wired upstream](gate-conjunct-wired-upstream.md) — gate/sensor steps (S40) may already have their Stop conjunct in runtime/goal/goal.go (since S29); the step only FEEDS the live score — don't demand a redundant ChangeSet.
- [Sandbox confinement allow-list](sandbox-confinement-allow-list.md) — confinement steps (S42): classifier must fail CLOSED (allow-list), hook DEFERS to pure core, binary promotion gate refuses red-mirror even at higher score.
- [Reality mirror one-way](reality-mirror-one-way.md) — S43 RealityMirror: ToKernel ALWAYS blocks (REALITY_CANNOT_DECLARE_TRUTH, non-nil ∀ input), Incident type makes version/mirror unrepresentable, proposes unset→OpenQuestion never guessed, migration re-asserts wall at row level.
