---
name: s109-reality-evolution
description: S109 per-project reality+evolution COCKPIT verification — pure composition of S106 ingest + S107 learn + S108 QD into one action-capable screen; verified green after 1 recurring gofmt struct-align fix
metadata:
  type: project
---

S109 `reality-evolution` per-project COCKPIT (ROADMAP-app-builder §S109, EPIC12/E12, KRD §53/§62/§64/§66/§67/§98) — the Workbench cockpit that COMPOSES the three already-built+tested deterministic engines into ONE action-capable screen. Invents NO new truth-mechanic; PURE orchestration, writes NOTHING above the line.

**Verdict: PASSED, AFTER 1 correction (the recurring gofmt struct-field-alignment scar, mechanical/safe).**

**THE COMPOSITION (verified real, not just claimed).** `closeReality(report, healthy)` (lib/reality-evolution.ts:101) = `ingest(S106)` → if draft!==null → `closeLoop(S107)` → redWaveAppeared = wave.items.length>0. All three dep-twin exports verified-exist with used sigs: learn.ts closeLoop:218/DEMO_EDGES:259/DEMO_HEADS:279/DEMO_INCIDENT_REF:281/DEMO_MIRROR:252/DEMO_TARGET:240/Outcome:204; reality-ingest.ts ingest:185/DEMO_DIVERGENT_REPORT:226/DEMO_HEALTHY_REPORT:234/DEMO_EXPECTATION:218/DEMO_PROJECT_ID:242/DraftFromDivergence:59/TelemetryReport:27; project-evolve.ts niches:67/promote:107/FixedMirror:16/Variant:22/PromotionResult:89. Go MCP closeReality additionally weaves reality.Observe(S43) to rebuild the incident before learn.Close — authoritative on the wire; TS twin uses closeLoop directly (display-composition).

**THE CORRECTION (recurring).** `gofmt -l mcp/reality-evolution/main.go` flagged it: the `closeRealityInput` struct's jsonschema-tagged fields were misaligned (the `realityingest.MirrorExpectation` long type-name shifted the column). `gofmt -w` fixed it. SAME scar as S104 (BlockReason struct-field-align) and S98 (var-block-align) — RECURRING: any Go file with multi-field structs carrying long type names + struct tags needs `gofmt -l` re-checked even when build/vet/test are green (gofmt is the ONLY sensor that catches alignment; build passes regardless). Executor's go test had passed cached → didn't surface it.

**ui-completeness / the wall.** Cockpit is action-capable: `close-reality` button + `healthy-toggle` (useActionState→closeRealityAction over pure twin), per-niche `promote-${niche}` + `authority-${niche}` toggle (→promoteEliteAction). All controls write NOTHING (wroteKernel/writesTruth=false; wall-status surfaces REALITY_CANNOT_DECLARE_TRUTH; promotion is PROPOSAL human freezes at /goal). Wall-grep on MCP main.go CLEAN (only WroteKernel bool field, comments, jsonschema descs, links import for edge propagation — no INSERT/UPDATE/Exec/fitness-write).

Done-crit (« ingérer un incident, approuver le miroir appris, voir le red wave apparaître ») PROVEN by Playwright 4/4 RAN live:3000 route-200, including the dedicated done-criterion test (provenance=incident → bump before!=after → red-wave-appeared data-appeared=true → wave-item contains mirror). vitest 10/10, go test mcp 5 uncached 0.005s + deps realityingest/learn/projectevolve all green, go build ./... clean, vet clean. tsc clean for S109 files, biome 6 files clean. i18n realityEvolution fr35==en35 EXACT, total fr4838==en4838, all 34 panel/page keys present. nav:164 (additive, WorkbenchHeader +2 lines only — project-evolve + reality-evolution, no existing route touched). Docs concept+internals MDX exist, 3 layers (Implémentation:9/Méta:29/Méta-méta:37), docs.json:285-286, mint validate + broken-links PASS, HEAD 31197a0==origin/main.

OQ (by-design, non-blocking): Linear MCP unauthenticated (only authenticate exposed, S109 issue not moved — best-effort §11); Mintlify search-index reindex lags push (pages registered + pushed, search not yet surfaced); real variant generator + out-of-sample backtest live behind MCP seams (inherited from S108, forward-dep).
