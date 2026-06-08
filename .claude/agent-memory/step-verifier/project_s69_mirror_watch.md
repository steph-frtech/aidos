---
name: project-s69-mirror-watch
description: S69 verification — materialize-and-watch-it-redden (watch it fail product path) PASSED green, zero corrections
metadata:
  type: project
---

S69 « matérialiser-et-le-voir-rougir » — the KRD §56 "watch it fail" made a user-triggered PRODUCT path over S68 authored mirrors.

Done-criterion: Godog author → Materialize → RED against absent code → stub → GREEN. Proven in Go fixture `TestWatchItFail_FixtureGherkinRedThenStubGreen` + 2 rapid (reproducibility + verdict-by-code-presence) + MCP test + TS twin vitest 5/5 + 4 Playwright e2e.

Core `back/kernel/mirror/watch/watch.go`: `Materialize(shapeeditor.Proposal)` PURE — dispatches by TestKind via CLOSED table `testKindToRunner` (acceptance→godog, property→rapid, fixture→fixture; unknown→ErrUnknownRunner NEVER guessed) + `renderSource` canonical byte-identical per shape (empty/missing fields→ErrEmptySpec). `CodeProbe{Present}` = SINGLE impure seam abstracted (S05 BaselineReplayer pattern). `RunStream` walks fixed Queued→Materialized→Running→Verdict; verdict = pure fn of code-presence (absent⇒LivenessDead/RED, present⇒LivenessAlive/GREEN) NO clock NO rng NO LLM. REUSES shapeeditor.* (S68) + records.Liveness (S06) verbatim, no fork, no new ADR.

Wall: writes NOTHING (WroteMirror path absent); freezing stays propose→ChangeSet→approval (S68/S20). actions.ts/lib grep CLEAN (only doc-comment matched "mirrors"). MCP `back/mcp/mirror-watch` 2 pure tools (watch_materialize, watch_run) writes nothing.

Front: lib/mirror-watch.ts byte-twin (materialize+runStream, front mirrorId=`reflects:shape` handle, Go id authoritative=OQ), vitest 5/5 tsc clean biome clean. /mirror-watch route action-capable (page+MirrorWatchPanel+watchAction Server Action) — all 10 e2e testids present (watch-submit/code-present/nature/reflects/source/result/verdict-badge/runner/stream/error). i18n title="Matérialiser-et-le-voir-rougir" matches e2e regex, redBadge=ROUGE/greenBadge=VERT match. natures()=[acceptance,invariant,workflow]. nav:132 in Build group.

go test watch+mcp ok, vet clean, gofmt clean, full go build ./... clean. i18n parity (3756 at S69-time; now 4053==4053 after S70/S71 added keys — parity is the invariant, not the absolute). docs 3-layer (Implémentation/Méta/Méta-méta) docs.json:207-208 pushed steph-frtech/docs main 10a83b5 (reachable from HEAD d483ef4 S71, 0-ahead 0-behind).

RE-VERIFIED 2026-06-08 (executor re-confirmed on-disk prior work): all claims hold, zero corrections. MCP 2 pure tools (watch_materialize/watch_run) no SQL. Panel testids all match e2e; data-phase="verdict"+data-status alive/dead asserted.

OQ by-design (non-blocking): real CodeProbe (compile+run runner against emitted code) behind seam = forward-dep; front mirrorId vs Go content-addr hash; Linear MCP unauthenticated (OAuth+restart needed) — step issue couldn't flip.

verified-green ZERO corrections.
