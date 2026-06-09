---
name: s107-learn
description: S107 /learn loop-closure verification — incident→approved mirror→hash bump→targeted red wave, PURE composition, verified green zero corrections
metadata:
  type: project
---

S107 `/learn` LOOP-CLOSURE (EPIC12/E12, ROADMAP §S107) — the external loop closes: production incident (RealityMirror provenance=incident, S106/S43) → human /goal approves a NEW mirror → attaching its reflection BUMPS the operation/policy content-address → seeds a TARGETED red wave (the worklist).

**Verdict: PASSED, ZERO corrections.**

Key design: COMPOSITION step, forks NO engine. The ONE new deterministic capability = hash-bump-on-mirror-attach (`reflectionAttached` merges the approved mirror id into a sorted/deduped `_reflections` set in the spec body, re-canonicalises+re-hashes → real content-address delta; no-op re-reflection → Moved=false → empty wave). The approved mirror is an INPUT (anti-circularity §8): `Close`/`BumpHash` RECEIVE the mirror, never return one.

Reused symbols all verified-exist with used sigs: reality.Learn:230 / reality.ToKernel:281 (always non-nil REALITY_CANNOT_DECLARE_TRUTH) / reality.Incident:78 / reality.IdeaCandidate:187 / redwave.Impact:162 (Edge carries links.Link not Ref — passed opaque, correct) / records.Hash:101 / records.Canonicalize:112 / links.Ref:78 / links.Heads:120(map[string]string) / blockreason.CodeRealityCannotDeclareTruth:146.

Done-crit ALL RAN: (1) fixture scen1 full journey green; (2) TestProperty_Close_NeverWritesKernel WroteKernel=false ∀ + grep CLEAN (fitness named only in doc-comments) + no INSERT/UPDATE/Exec in learn+mcp; (3) BumpHash reuses records.Hash/Canonicalize, TargetedWave reuses redwave.Impact, rapid+fast-check repro mirrors. go test -count=1 learn 0.017s + mcp 0.010s; broad go build ./... OK; prior-green reality/redwave/records/links intact.

MCP aidos-learn = 3 PURE read-only tools (bump_hash/targeted_wave/close_loop, ADR 0009) wall-grep CLEAN. TS twin lib/learn.ts FNV-1a contentHash display-only (Go records.Hash authoritative on wire) vitest 4/4 tsc-clean-for-learn biome 6 files clean. /learn action-capable useActionState→closeLoopAction over pure twin: close-loop control + re-reflect toggle; testids close-loop/re-reflect-toggle/learn-result/provenance/bump-target/bump-before/bump-after/bump-moved/wave-list/wave-item/wave-empty/wall-status/wall-code all present; h1=t("title") matches e2e /nouveau miroir|new mirror/; moved="BUMP…" matches /BUMP/, notMoved="cosmetic re-reflection" matches regex, noKernelWrite="writes no kernel" matches wall regex. nav:163. i18n fr30==en30 learn keys EXACT, total fr4782==en4782. Playwright 4/4 RAN live:3000 route-200.

Docs: concept+internals MDX exist, 3 layers as headings (Implémentation:9/Méta:27/Méta-méta:35), docs.json:281-282, mint validate PASS, HEAD fccbd85==origin/main.

NOTE: executor honestly flagged that the prompt's "outputs" bullet list was a copy-paste of S106 reality-ingest criteria; implementation correctly targets the S107 HEADER done-criteria. Not a defect.

OQ (by-design, non-blocking): Linear MCP unauthenticated (S107 issue not moved); Mintlify search-index reindex lags push by minutes. Both forward/external-dep OpenQuestions per §6/§7.
