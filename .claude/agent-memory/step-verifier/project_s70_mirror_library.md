---
name: project-s70-mirror-library
description: S70 verification — mirror library by project + project-scoped monster detector PASSED green, zero corrections
metadata:
  type: project
---

S70 « la librairie de miroirs par projet + la détection de monstre scopée au projet » — the user's mirrors listed BY APP with liveness, plus completeness/monster detection SCOPED to ONE project (multi-project AIDOS, S55 RLS made deterministic).

Done-criterion: fault-injection — the project-scoped monster detector fires. Proven `TestProjectScopedMonster_FaultInjection` (app-A baseline COMPLETE; app-B fires no_truth_without_mirror; scope isolation: B monster does NOT redden A) + `TestCrossProjectReflectIsOrphanWithinScope` (cross-project reflect = orphan within scope, a monster the GLOBAL cut hides) + MCP test + TS twin vitest 5/5 + 4 Playwright e2e.

Core `back/kernel/mirror/library/library.go`: ProjectLayer/ProjectMirror tag records.Layer/Mirror with owning ProjectID. ListByApp groups mirrors per app + alive/dead tally (alive iff IsLiving). ScopeTo projects global Library down to ONE project's cut (sorted, no leak). ScopedCompleteness REUSES records.ComputeCompleteness (S06) VERBATIM over that cut alone — the only new behaviour is the SCOPE. HasMonster derived from verdict. PURE/TOTAL/DETERMINISTIC, no clock/rng/LLM. 2 rapid: reproducibility + scope-never-leaks. go test+vet+gofmt clean.

Key insight pinned by fault-injection: scope is NOT cosmetic — a mirror in A reflecting a layer owned by B is an orphan within A (B's layers invisible in A's cut) → no_orphan_mirror. The global cut would hide it. Anti-Goodhart: aggregate-green hides a red app.

MCP `back/mcp/mirror-library`: library_list_by_app + library_scoped_health, pure, write nothing (ADR 0009). Front lib/mirror-library.ts twin reuses lib/mirror-health (computeCompleteness/isLiving), DEMO_LIBRARY = app-shop COMPLETE (2 alive) + app-blog both monsters (Blog.Post no mirror + blog.cross.schema→Shop.Order orphan). /mirror-library route action-capable (page+MirrorLibraryPanel+scopeAction Server Action) writes nothing. e2e testids: library-submit/library-project/library-result(data-verdict/data-monster/data-project)/monster-list(data-reason)/apps/app-card(data-project, data-liveness). tsc/biome clean, vitest 5/5.

Wall: actions/MCP/lib grep CLEAN (only doc-comments match kernel/mirrors). nav:133 in Build group next to /mirror-watch. i18n 3778==3778, title "Librairie de miroirs par projet" matches e2e regex.

docs 3-layer (Implémentation/Méta/Méta-méta) docs.json:209-210, pushed steph-frtech/docs main 6473062 0-ahead 0-behind. mint earlier validated by executor.

OQ by-design (non-blocking): Linear MCP unauthenticated (OAuth+restart) — step issue couldn't flip; front mirrorId vs Go content-addr hash authority; real mirrors⋈kernel projection feed = forward substrate.

verified-green ZERO corrections.
