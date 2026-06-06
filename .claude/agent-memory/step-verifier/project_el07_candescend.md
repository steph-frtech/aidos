---
name: project-el07-candescend
description: EL07 verified-green — pure CanDescend forcing gate + ShrinkOptionSpace anti-vacuity; biome-clean report lie recurred (optional-chain warning, autofix SAFE here)
metadata:
  type: project
---

EL07 (compound-du-besoin track): the PURE forcing function in back/runtime/besoin/candescend.go.

**CanDescend(graph, level, meta) → Verdict{enough, missing[], openQuestions[], blockReasons[]}** — pure/total/deterministic, above the wall (reads only BesoinGraph, writes no truth; imports only encoding/json, fmt, sort, strings, blockreason — no pgx/INSERT/kernel/mirrors/fitness). `enough` COMPUTED from 5 gates, never declared (anti-Goodhart §8): (a) body non-vacant — RequiredFields sourced from EL06 DefaultThresholds().RequiredFieldsFor (SAME source, no 2nd copy) + per-rung parse (product 1..MaxScenarios scenarios, journey Gherkin Given/When/Then structural-not-LLM, control visible_when/enabled_when bool-typed); (b) 4 metadata via CertifyMetadata (EL04 reused); (c) outgoing ref resolves OR forward-dep (operation→entity non-enumerable) = carried OpenQuestion + enough=true (bootstrap §6, NEVER blocking); (e) anti-vacuity ShrinkOptionSpace>0. Gate (d) frozen-anchor = EL08's, not evaluated here (declared OQ).

**ShrinkOptionSpace** = pure count |OptionSpace| − kept (archetypes body's `selects` retains); selects nothing/all/invalid → 0 (vacant, rejected); non-enumerable pair / leaf → positive sentinel (forwardDepShrink=1, satisfied-by-OQ never fabricated). product→journey 7 archetypes, select 2 → shrink 5.

**BesoinBlockCode** = besoin-local closed enum (NODE_ABSENT, BODY_VACANT_OR_MALFORMED, METADATA_INCOMPLETE, REF_UNRESOLVED, OPTION_SPACE_NOT_NARROWED) reusing blockreason.BlockReason SHAPE without polluting kernel-side closed blockreason.Code registry — by design (§4 self-contained), good.

Go fixture mirror (RED→GREEN) + rapid property (reproducibility + anti-vacuity count law + gate law). TS twin lib/besoin-candescend.ts byte-equivalent (metaComplete:boolean is the EL04 seam — screen supplies it, twin doesn't re-implement classifier; acceptable). vitest+fast-check 13/13. Full besoin package green (EL01-EL07 prior still green). gofmt/vet/tsc clean.

**SCAR (biome-clean report lie recurred, see [[feedback-biome-clean-report-lie]]):** report claimed "tsc + biome clean" but biome flagged 1 warning — `!os || !os.enumerable` at candescend.go-twin:74 → suggest optional chain. UNLIKE EL05/EL21 where autofix was semantically WRONG, here `!os?.enumerable` IS equivalent (os undefined → undefined → !undefined=true). Applied the safe fix. NB the sibling `if (os && !os.enumerable)` in canDescend is a DIFFERENT shape (guard branch) correctly NOT flagged. Re-ran biome clean, tsc clean, vitest 13/13 after fix.

Report's "i18n parity 2807/2807" was STALE — actual 2996==2996 both locales (28 besoinCanDescend keys both, nav.besoinCanDescend wired both, /compound-besoin-candescend k="besoinCanDescend" WorkbenchHeader:46). Parity holds, only the number was wrong.

Panel BesoinCanDescendPanel action-capable: case-select + verdict-cta (runs canDescend) + shrink-cta (runs shrinkOptionSpace) + reset, no headless capability. e2e besoin-candescend.spec.ts 4/4 PASS on live :3000.

Docs 2a52b5b HEAD==origin/main, 2 pages (concept + internals), registered docs.json:299-300, internals 3 layers (Implémentation:9/Méta:49/Méta-méta:57). FwdDep OQ: EL08 owns AnchorsAbove cascade + before/after ShrinkOptionSpace; EL15 owns besoin Postgres schema + besoin-intake MCP. Linear MCP unauth=OQ. verified-green.
