---
name: el16-emitideas
description: EL16 emit-ideas — deterministic EmitIdeas(graph)→[]Idea batch projection of BesoinGraph into draft-Idea backlog, governed by closed table LevelToProposes (EL05)
metadata:
  type: project
---

EL16 = the deterministic EMITTER `EmitIdeas(g BesoinGraph) → []ideas.Idea` (back/runtime/besoin/emit_ideas.go): batch projection of a completed BesoinGraph into the candidate-truth backlog S64 consumes. Per RESOLVED MAPPING rung emits ONE draft Idea {Proposes=LevelToProposes(level) [EL05 closed table], Intent=verbatim utterance (Provenance.Detail), Provenance human, Status=draft via ideas.Capture}; NoEmit rungs (journey/view/invariant) emit NOTHING (no silent cast); non-resolved (empty/drafting) emit nothing. id reuses records.Hash via ideas.Capture → content-addressed + idempotent (byte-identical re-emission). PURE: no DB/grant/clock/rng/LLM, returns []Idea writes nothing.

THREE DOORS reuse projectNode (byte-identical ids): EmitIdeas (stored NodeResolved, what Godog proves), EmitIdeasResolved (EL07 CanDescend.Enough), EmitIdeasUnion (stored-resolved OR EL07-enough — the MCP door, because EL15 persists nodes as `drafting`, right-sizing is recomputed EL07 verdict not a stored flag). EmittedIdea{Idea,FromLevel} carries topological order for S64 hand-off. EmitCount = count authority (front renders it, never re-derives).

ORDERING PARITY VERIFIED: Go iterates g.Nodes canonical order = sourceOrder(product,journey,view,control,action,operation,entity)+bands(invariant,policy); TS EMIT_ORDER lists exactly those 9 in same order. Match exact.

DONE-CRIT MET: Godog 5 scenarios green (2 mapping→2 drafts human-prov / product+journey→1 (journey NoEmit) / re-emit byte-identical / unverifiable via draft→grill→spike with direct-spike-from-draft REFUSED — confirmed lifecycle.go Spike legal only from grilled / drafting→nothing); HasMirror ALWAYS false proven 3 ways (Godog canonical-body no mirror/version key + rapid TestEmitIdeas_NoMirrorNoVersion + Testcontainers CanWriteKernel always false; ideas.Idea has NO Version/Mirror field by construction); S64 hand-off net via FromLevel + docs.

WALL STRUCTURAL: emit_ideas.go imports ONLY fmt+ideas (no pgx/sql/INSERT/kernel-mirror/fitness); MCP emitIdeas persists ONLY via s.ideas.Insert (legal idea_capture door, ON CONFLICT DO NOTHING), dry_run previews, no kernel/mirror write, no GRANT. Testcontainers asserts CanWriteKernel always false + journey=NoEmit (besoin_capture_journey appends node emits 0 Idea) + idempotent re-emit.

SENSORS: gofmt clean, vet clean, build ./... clean, full besoin pkg `go test` green (prior-green intact); rapid 5 props (Deterministic/GovernedByTable/NoEmitNeverEmits/CountMatchesAuthority/NoMirrorNoVersion). TS twin lib/emit-ideas.ts vitest 8/8, tsc clean, BIOME CLEAN (biome-clean-lie scar did NOT recur this step). i18n parity 3065==3065, all 25 emitIdeas t() keys present BOTH locales, nav.emitIdeas wired href=/emit-ideas. Panel runs emitIdeas() in-browser (front-wall, no fetch, no truth write) = action-capable ui-completeness. e2e 4/4 :3000 (route 200 on :3000 NOT :3100). Docs el16 concept+internals 3 layers (Implémentation/Méta/Méta-méta) registered docs.json, mint validate passed, pushed HEAD==origin/main 2ae301f.

OQ (non-blocking, by-design fwd-dep): Linear MCP unauth (only authenticate/complete_authentication surfaced) — EL16 issue NOT moved Done. S64 app-builder consumes backlog in topological order EL16 computes. verified-green ZERO corrections.
