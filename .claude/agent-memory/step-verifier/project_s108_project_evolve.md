---
name: s108-project-evolve
description: S108 per-project medium loop (/evolve + QD) verification — found+fixed a real back-map ID-collision bug in Niches surfaced by the rapid property mirror; verified green after correction
metadata:
  type: project
---

S108 `projectevolve` PER-PROJECT MEDIUM LOOP (ROADMAP-app-builder §S108, EPIC12/E12, KRD §62/§64/§66) — the `/evolve`+QD loop run FOR ONE PROJECT under a FIXED user mirror. Searches for a better IMPLEMENTATION of an already-frozen truth, never a new truth. PURE/deterministic, writes NOTHING.

**Verdict: PASSED, AFTER 1 real correction (a genuine bug, not cosmetics).**

**THE BUG (caught by the property mirror, the verifier's job).** `Niches(m, variants)` culls mirror-breakers, projects survivors into the CONSUMED S26 `qd.Elites` (keyed by `NicheKey`=projectID::niche), then maps the qd élites back to the rich project `Variant`. The original back-map was `byID := map[string]Variant{}` keyed by `v.ID` ALONE. But the rapid generator draws `ID` and `Niche` INDEPENDENTLY (id `v[0-9]{1,4}`, niche sampled from 4) → two survivors can share an id while living in different niches, OR share BOTH niche and id with different fitness. Keying by id alone → the back-map returns the WRONG rich Variant (wrong niche/fitness). `TestProp_OneElitePerNiche` failed: "élite of shop::createOrder/cheap is not the max-fitness survivor (1 vs 0.0105)". Default `rapid.checks` (~100/run) sometimes MISSED it — only `-count=5 -rapid.checks=3000` reliably surfaced the same-niche-same-id-diff-fitness variant. The executor's own `go test` (default checks) had passed by luck → executor honestly reported green but the mirror was flaky-passing.

**THE FIX (2-part, projectevolve.go ~l192).** Back-map keyed by `NicheKey(v)+"\x00"+v.ID` (the (nicheKey,id) pair is what qd returns) AND keep the MAX-fitness survivor per (key,id) so the rich back-map agrees with qd.Elites' max-fitness selection. After fix: `-count=5 -rapid.checks=5000` (25k checks) green, gofmt clean.

**LESSON / RECURRING PATTERN — flaky-passing property mirror.** When a step projects into a CONSUMED engine (here qd.Elites keyed differently than the rich type) and maps results BACK by a partial key (id alone), a property test with independently-drawn fields can collide. ALWAYS re-run the rapid/property mirror with elevated `-count` and `-rapid.checks` (≥3000) — a default-checks pass is NOT proof the invariant holds. Flag command: `go test ./pkg/ -count=5 -rapid.checks=5000` (flags AFTER the package path — `-rapid.checks=N ./pkg` parses `.` as a bogus package). The TS twin's `niches` was structurally correct (iterates survivors, keys by nicheKey, keeps max-fitness) — the bug was Go-only, born from the intermediate `byID` map the twin never had.

Reused symbols all verified-exist w/ used sigs: evolve.Promote:273(v Variant,e Evidence)→PromotionResult / evolve.Confine:164 / evolve.Evidence:202 / evolve.Variant:212 / evolve.EmittedWrite:315 / evolve.Zone{BranchesEvolution:56,Reports:57,IdeasProposed:58} / evolve.VerdictAllowed:118 / evolve.MirrorGreen/Red, OutOfSampleGreen/Red, PromotionProposed/Refused / qd.Elites:84(keyed by Niche=NicheKey) / qd.Variant{ID,Niche,Mirror,Fitness} / blockreason.CodeSandboxEscape:123/605 (SANDBOX_ESCAPE, registry non-empty).

Done-crit ALL RAN green after fix: fixture 5 tests (1) mirror-breaker fitness 0.99>0.9 KILLED + never élite (anti-Goodhart) (2) green élite refused w/o authority, proposal-only WritesTruth=false w/ authority + out-of-sample-red refused even w/ authority (§87) (3) every emitted write confined + cross-project refused w/ BlockReason; rapid 4 props (determinism/no-élite-breaks-mirror/emitted-never-govern/one-élite-per-niche). go test 0.011s, prior-green runtime/evolve + archive/qd intact, gofmt/vet/build ./... clean.

MCP aidos-project-evolve = 4 PURE tools (run/cull/niches/promote, ADR0009) wall-grep CLEAN (only `fitness` JSON field/desc, no INSERT/UPDATE/Exec). TS twin lib/project-evolve.ts FNV display-only, vitest 7/7, tsc-clean-for-project-evolve. /project-evolve action-capable (useState→break-mirror toggle, grant-authority toggle, per-niche Promote onClick:188 over pure twin); testids fixed-project/fixed-mirror/break-mirror-toggle/grant-authority-toggle/niches-list/killed-list/promote-result/promote-verdict/promote-wall present; promote-wall surfaces writesTruth=false→noTruthWrite (wall respected, freeze=human /goal). nav:163. i18n projectEvolve fr19==en19, total fr5101==en5101 EXACT. Playwright 3/3 RAN live:3000 route-200 (covers done-crit 1+2).

Docs concept+internals MDX exist, 3 layers as headings (Implémentation:9/Méta:27/Méta-méta:35), docs.json:283-284, mint validate PASS, HEAD de2aac3==origin/main.

OQ (by-design, non-blocking): Linear MCP unauthenticated (S108 issue not moved — best-effort §11); Mintlify search-index reindex lags push; real variant generator + out-of-sample backtest live behind MCP seams (engine consumes verdicts, as in S42) — forward-dep.
