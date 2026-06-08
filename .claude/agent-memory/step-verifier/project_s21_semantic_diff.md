---
name: s21-semantic-diff
description: S21 SemanticDiff classifier — verified GREEN; pure Classify over six §44.1 change_types + aidos diff + /semantic-diff panel
metadata:
  type: project
---

# S21 — SemanticDiff classifier (KRD §44.1)

**Verdict: PASSED, 1 cosmetic correction.**

PURE `Classify(old,new Artifact)->SemanticDiff` over CLOSED §44.1 set, SIX landed {add,refine,override,rescope,reweight,deprecate} + special none/unclassifiable (NOT fabricated — unclassifiable carries OpenQuestion). reauthorize/replace_mirror intentionally NOT landed (ride S16/S06). Precedence: identity→none · old-absent→add · lifecycle→deprecate · scope-only→rescope · weight-only→reweight · enabled_when-change→override (conservative: implication==canon-equal, any change=override) · consistent-superset→refine · else→unclassifiable. Deps: ONLY back/kernel/records (reuses S02 Canonicalize/Hash). No time/rand/sql/pgx/INSERT — pure/total/never-panics.

**Done-crit all 3 proven** (fixture 8 rows A-H + rapid 7 props): RowA incompatible enabled_when→OVERRIDE, RowB scope change→RESCOPE not override, RowC cosmetic→load-bearing→REWEIGHT; +D add/E refine/F deprecate/G unclassifiable-with-OpenQuestion/H identity-none. `go test -count=1 ./runtime/semanticdiff ./cmd/aidos` GREEN, gofmt/vet clean, full `go build ./...` clean.

`aidos diff <id> --from --to` (cmd/aidos/diff.go) READ-ONLY pure dispatcher, 3-pair fixture catalogue (kernel-version store-query = OQ-S21-1 forward-dep S02/S24), renders human-language sentence + referenced blast_radius/requires_authority/red_wave (S15/S16/S17 — REFERENCED never recomputed). CLI tests pass.

Front lib/semantic-diff.ts byte-faithful TS twin (same 8-step precedence), vitest 6/6, tsc clean, biome clean. /semantic-diff SemanticDiffPanel action-capable (3 buttons + select run classify, awaiting-before), themed ADR0010 tokens, e2e 4/4 GREEN live :3000 incl all 3 done-crit + action-capability. NO ChangeSet (S21 adds no truth — correct, wall intact). i18n 3441==3441 semanticDiff 32==32.

Docs concept+internals (3 layers Implémentation·Méta·Méta-méta) docs.json:111-112, mint validate success, clone clean on main (not ahead).

**Correction (1, cosmetic):** biome format nit in tests/e2e/semantic-diff.spec.ts — one-line toContainText("rescope") wrapped multi-line. NOTE: e2e dir has 16 pre-existing format issues repo-wide → e2e specs NOT held biome-clean by repo posture (fixed only the S21 one).

**Non-gap noted:** badgeClass uses raw palette colors (border-red-500/bg-blue-600/amber) = established 52-component status-coloring convention, NOT ADR0010 violation (ADR0010 bans zinc-*/hex STRUCTURAL theming; panel correctly uses border/bg-card/text-foreground tokens for structure).

OQ by-design: kernel-version read=fixture-catalogue-until-S02/S24-store-query / reauthorize+replace_mirror=S16/S06 / blast_radius+authority+red_wave=referenced-S15/S16/S17-not-recomputed / Linear-unauth. verified-green.
