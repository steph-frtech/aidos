---
name: s104-strangler
description: S104 strangler-fig legacy absorption (§50/EPIC11) — Archive pkg carve/freeze/refactor over characterization mirrors; verified-green after 1 gofmt fix
metadata:
  type: project
---

S104 = §50 strangler-fig, the last EPIC11 gap: how a legacy (a world WITHOUT mirrors) ENTERS the federation without a big-bang rewrite. PURE Archive pkg `back/archive/strangler` (writes NOTHING, the wall):
- **Carve(Legacy)→StranglerCell** — draw cell boundary (reuses S100 cell.Ref), refuse unobserved (STRANGLER_NO_OBSERVED_BEHAVIOUR) / unnamed (STRANGLER_UNNAMED_CELL); content-addr via records.Hash(Canonicalize) S02 reused.
- **Freeze(sc)→[]CharacterizationMirror** — ONE fixture mirror per observed (input→output) trace, tagged `Characterization=true` + `TestKind="fixture"` so completeness (S12) never confuses w/ intent mirror; DETERMINISTIC code projection NOT LLM.
- **Refactor(sc,mirrors,obs)→RefactorVerdict** — replay frozen mirrors vs refactored observed behaviour; ACCEPTED iff AllGreen ∧ ContractHonored; drift→STRANGLER_CHARACTERIZATION_DRIFT (drift takes precedence, names diverging scenarios), broken contract→STRANGLER_PUBLISHED_CONTRACT_BROKEN; sameOutput=records.Canonicalize byte-eq (key-order insensitive). The §50 honesty: char mirror is the OPPOSITE of a normal mandate-A mirror (green net from OBSERVED behaviour incl bug-for-bug, not red goal from intent); a behaviour change goes through idea→mirror→/goal, never edit a char mirror.

Done-crit (Godog-shape fixture + rapid + fast-check + Playwright) ALL RAN: preserving refactor stays green+contract honored→ACCEPTED; behaviour change reddens EXACTLY its mirror→refused drift; dropped scenario→drift; broken contract→refused; carve-without-observed→refused. go test -count=1 strangler+mcp 0.041s; rapid 5 props (Carve/Freeze/Refactor determinism, freeze-then-replay-always-accepted, any-drift-always-caught); broad `go build ./...` exit0 prior-green cell/records intact.

MCP aidos-strangler 3 PURE tools (carve/freeze/refactor) read-only stdio write-NOTHING wall-grep CLEAN. TS twin lib/strangler FNV-1a display-only (Go records.Hash authoritative) vitest 8/8; tsc clean-for-strangler; biome 11 WARN all noNonNullAssertion `carve(l).cell!` on test twin = RECURRING non-blocking warning-level. /strangler action-capable 2 controls (start-strangler=carve+freeze / run-refactor + break-behaviour|break-contract toggles via useActionState→Server Actions over pure twin), wall-respected; nav:161; i18n strangler-ns fr29==en29 EXACT; h1 t("title") "Strangler-fig: ..." matches e2e /Strangler-fig/; green=vert/drift=drift/accepted=accepté/refused=refusé all match e2e regex; Playwright 5/5 RAN live:3000 route-200.

Docs 3-layer Impl·Méta·Méta-méta concept+internals s104-strangler.mdx docs.json:275-276 mint validate PASS HEAD 3506769==origin/main.

OQ by-design forward-deps (NOT residual): OQ-S104-record (real recording of legacy traces + build-loop driving refactor = S83/S106, strangler consumes supplied observations black-box) / OQ-S104-changeset (freeze PROPOSES ChangeSet, mirrors schema above-line S06/S20, pkg writes nothing) / OQ-S104-linear (linear-server MCP unauth) / no docs/plan/S104-*.md (spec=ROADMAP-app-builder §S104).

verified-green AFTER 1 CORRECTION: `gofmt -w` strangler.go BlockReason struct-field alignment (`Code:` vs `Message:`) — RECURRING gofmt var/struct-block-align pattern on S104-own file, mechanical/safe.
