---
name: project-el17-redbacklog
description: EL17 RedBacklog verification — pure Kahn topo-sort of EL16 emitted Ideas, BESOIN_CYCLE refusal, mirror form annexed not written, read-only MCP; verified-green
metadata:
  type: project
---

EL17 (back/runtime/besoin/red_backlog.go) — RedBacklog(graph)->[]BacklogItem + RedBacklogUnion(graph,metaOf): PURE deterministic topological sort (Kahn over emitting MAPPING rungs only, tie-break by declared descent rank `levelRank` then level string → TOTAL order) of EL16's emitted Ideas along constrains/seeds edges → the §23 verticale promotion order S64 opens /goal in. Two doors: RedBacklog (stored-status) + RedBacklogUnion (EL07 CanDescend union, the MCP door against persisted `drafting` graph). Both delegate to `backlogFrom`. Imports ONLY fmt/sort/ideas — wall STRUCTURAL (no pgx/sql/INSERT/kernel/mirror/fitness, comment-only mention).

Done-criteria ALL MET: (1) property rouge→vert — rapid: Deterministic(byte-id json), TotalCoversEmittedExactlyOnce, TopoOrderRespectsEdges, NoEmitNeverInList, MirrorFormAnnexedNotWritten (also asserts Idea has NO mirror/version key via Canonicalize); Go fixtures: ProductThenEntity, JourneyIsNoEmitButAnchors, NoEmitInAnchorsAbove (journey+view in control's anchors_above, never in list), RefResolution (dangling →action = carried OQ, present = resolved), CycleRefused (back-edge entity→product → *CycleError code BESOIN_CYCLE). (2) tri = algorithme pur — Kahn, no LLM, reproducibility mirror. (3) forme annexée jamais écrite — LevelMirrorForm(EL10) annexed per item, HasMirror false, MCP read-only.

CycleError typed (Code()=BESOIN_CYCLE, Cycle(), AsCycleError); self-loop = degenerate cycle; dedup edges so doubled edge doesn't inflate indeg; cycle surfaces remaining-set sorted by rank.

MCP besoin_red_backlog (back/mcp/besoin-intake/main.go:565 redBacklog): LoadGraph→RedBacklogUnion→build output, NO Insert; cycle→{Cycle:true,CycleCode}. Testcontainers TestBesoinIntake_RedBacklogEL17 (agent role): product+journey+entity persisted, backlog Count=2 (journey NoEmit excluded), product before entity, mirror form annexed non-empty, journey in anchors_above, READ-ONLY (ideas.Count unchanged before/after), CanWriteKernel false before AND after. Green 2.7s.

TS twin lib/red-backlog.ts = faithful Kahn port (same tie-break, same CycleError, same resolveItemRefs incl. verbatim French OQ text, openQuestions.sort()); vitest+fast-check 7/7; tsc clean; biome clean. Panel RedBacklogPanel.tsx runs redBacklog(nodes,edges) IN-BROWSER (no fetch = front-wall); ui-completeness (sort-cta/cycle-cta/reset-cta). Route /red-backlog uses 28 redBacklog.* keys + nav.redBacklog, ALL present both locales. i18n parity 3094==3094 (report said 3293/3293 = STALE cosmetic). e2e red-backlog.spec.ts 4/4 GREEN on :3000 (Next forces single dev instance regardless of port; reuse existing :3000 which served /red-backlog 200).

Docs b7c3902 HEAD==origin/main, both pages exist (concept+internals 3 layers Implémentation/Méta/Méta-méta), registered docs.json:319-320, mint validate passed.

Commit 2a1e4ea (EL17 fully committed, 13 files +2994). NOTE: working tree has many untracked EL15/EL16 files (besoin-intake MCP store/ideastore, emit_ideas, invariant, migrations, panels) — those are PRIOR steps' artifacts not yet committed, NOT EL17's concern; EL17 itself is clean and committed.

Linear unauth=OQ (only authenticate/complete_authentication exposed). Verified-green, ZERO corrections.
