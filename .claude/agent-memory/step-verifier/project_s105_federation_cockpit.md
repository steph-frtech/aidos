---
name: project-s105-federation-cockpit
description: S105 verification — federation cockpit assembler (§50/EPIC11), pure composition over S100+S102+red-wave, verified green ZERO corrections
metadata:
  type: project
---

S105 « cockpit de fédération » (§50, app-builder EPIC11) — PURE COMPOSITION cockpit, additive (§9), forks NO truth logic, writes NOTHING (the wall).

**What it is:** `back/runtime/cockpit` AssembleSnapshot(p, depGraph, baseline, fed, wave) → CockpitSnapshot. Composes verbatim: cell.Partition (S100 per-cell BEHAVIOURAL ratchet, FIRST §43) + archfitness.Measure/Ratchet (S102 STRUCTURAL ratchet, SECOND §47) + red-wave fan-out (§51, a global policy reddens exactly the violating cells; a non-violating contracted neighbor stays green & SHIPS). Every list sorted → byte-identical snapshot. globallyStable = all-ship ∧ structural HELD. Reddened cell gets one-row worklist, never ships.

**Reused symbols verified-exist w/ used sigs:** cell.Partition:236, cell.Ships:402 (c.Ratchet==RatchetGreen), cell.Project/Federation/Contract/Node/Ref/KindLayer|Mirror|Contract/RatchetGreen|Red; archfitness.Measure:136, Ratchet:358, DepGraph(.Project/.Cells/.Edges/.Federation), StructuralMetric, RatchetVerdict(.State/.Block), StateHeld/StateBroken.

**Done-criterion (ROADMAP L188):** deux cellules, un contrat, un red wave transverse ; une cellule montre une coupe locale verte et SHIP pendant qu'une voisine est encore ROUGE. PROVEN by Playwright test "the §50 done-criterion" (order ships green local cut while payment reddened+no-ship) RAN live:3000 4/4.

**Verified green:**
- Go: go test -count=1 cockpit+mcp 0.009s/0.007s; broad build OK; vet/gofmt clean; prior-green cell+archfitness intact. fixture 3 scenarios (red-wave/no-wave-globally-stable/structural-regression-breaks-global) + rapid 2 props (determinism + reddened-never-ships/green-non-violating-always-ships/global-iff-all-ship∧held).
- Wall: grep CLEAN (only INSERT in comments). MCP federation-cockpit 1 tool assemble_snapshot PURE read-only stdio write-NOTHING.
- TS twin lib/federation-cockpit reuses arch-fitness.ts+cell-federation.ts twins, Go-authoritative; vitest 4/4; tsc clean for S105 (1 err = behavior-capture.test.ts S77 pre-existing untracked, NOT-S105 RECURRING); biome 6 files clean.
- UI /federation-cockpit action-capable: 1 control assemble-cockpit + 2 toggles fire-wave/break-structure bound to Server Action over pure twin, useActionState, themed ADR0010, wall-respected (comment-documents value-only). nav:161. i18n fr4720==en4720 EXACT, federationCockpit ns 32==32. h1 title matches e2e regex /Cockpit de fédération|Federation cockpit/.
- e2e 4/4 RAN live:3000 GREEN.
- Docs 3-layer Impl/Méta/Méta-méta concept+internals docs.json:277-278 mint-validate PASS HEAD 2e45ad7==origin/main.

**OQ (by-design, non-blocking):** Linear-unauth (OAuth interactive); mintlify reindex-lag (pushed clean, propagates). by-design forward-deps: structural baseline→ChangeSet S102/per-cell RedWorkQueue INSERT→S22 hook below waterline.

**Verified-green ZERO corrections.** PATTERN: S100-S105 EPIC11 federation chain all pure-composition reusing prior twins, all verified ZERO/minimal corrections.
