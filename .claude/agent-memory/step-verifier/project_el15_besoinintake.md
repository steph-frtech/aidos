---
name: project-el15-besoinintake
description: EL15 besoin-intake MCP — the single capability door (13 tools) over the BesoinGraph, persists already-decided pure-fn graph, wall via GRANT+RLS
metadata:
  type: project
---

EL15 = the SINGLE capability door over the BesoinGraph (ADR 0009): MCP `back/mcp/besoin-intake/` (Go MCP SDK), **13 tools** registered (read: besoin_graph_state/_level_schema/_list; capture per rung: product/journey/view/control/action/operation/entity/invariant = 8; validate: besoin_validate_level/_classify) — main.go line-470 comment says "twelve" = COSMETIC miscount, doc says 13 = correct, non-blocking.

**Determinism-first PROVEN**: server runs NO LLM — it only PERSISTS an already-decided already-hashed graph; all verdicts are the pure besoin.* fns (RecordAnswer EL07/EL12, RecordInvariant EL14, LevelToProposes EL05, CertifyMetadata EL04, EnterableLevel). grep for anthropic/openai/llm clean (only a French comment + `forallMarkers` matched). Reproducibility mirror determinism_property_test.go (rapid): metaInput.toMeta + levelSchema projection pure total fns, non-grammar level rejected.

**Wall STRUCTURAL + ENFORCED**: store.go imports only pgx/records/besoin (no kernel/mirrors/fitness write path in pure besoin pkg either). Migration besoin_graph_baseline.sql: `besoin` schema + besoin.node (append-only, content-addressed by graph_hash=records.Hash(Canonicalize), ON CONFLICT DO NOTHING idempotent, DOUBLE-ABSENCE CHECK no version/no mirror key), GRANT INSERT/SELECT/UPDATE (NO DELETE) on besoin + reuse ideas, RE-ASSERTS REVOKE on kernel.truth/layer/link + mirrors.mirror (no fitness grant). CanWriteKernel probe ALWAYS false (Testcontainers runs as aidos_agent LOGIN role, real GRANT+RLS gate).

**RLS (S55 fwd-dep, MODELLED here not OQ-blocking)**: project isolation via session GUC aidos.project (set_config LOCAL to tx in store.scoped), policy USING+WITH CHECK; B never sees A — proven by TestBesoinIntake_ProjectIsolationRLS. The TYPED ProjectScope is owned by S55; EL15 delivers the FUNCTIONAL isolation now = valid bootstrap.

**Done-criteria all met**: Testcontainers TestBesoinIntake_EndToEnd green (round-trip JSONB hash-stable, append-only count grows, RLS isolation, Pact-per-tool every tool exercised, kernel-write refused via GRANT, journey=NoEmit emits 0 Idea, ∀ invariant NoEmit + circularity-ban self-authored refused, fail-closed off-altitude BlockReason graph-unchanged) ∧ fail-closed ∧ determinism-first. go test ./mcp/besoin-intake/ ok 5.5s. EL05 mapping rung emits Idea via ideas.Capture (provenance human verbatim), NoEmit (journey/view/invariant) emits none.

**TS twin** lib/besoin-intake.ts byte-equiv projection (besoinLevelSchema + captureProjection emit/no-emit), vitest 8/8, tsc clean. Panel BesoinIntakePanel runs twin IN-BROWSER (no fetch = front-wall), action-capable 3 controls (schema-cta/project-cta/reset-cta) + full tool inventory enumerated (ui-completeness). nav besoinIntake both locales, i18n full-key parity 3039==3039 zero orphans. e2e 5/5 on :3000.

**Docs**: both pages exist (concept + internals 3 layers Implémentation·Méta·Méta-méta), registered docs.json, mint validate passed, commit 2935002 HEAD==origin/main pushed.

**SCAR — gofmt + biome-clean-lie BOTH recurred** (see [[feedback-biome-clean-report-lie]]): report claimed gofmt+biome clean but (1) gofmt -l flagged main.go (struct-field tag alignment in stateOutput/schemaOutput/classifyOutput) → gofmt -w fixed; (2) biome had 8 noNonNullAssertion warnings in lib/besoin-intake.test.ts → fixed with explicit `.not.toBeNull()` guards + `?.` (NOT bare autofix that would silently weaken; here the not-toBeNull guard precedes so intent preserved) → biome clean. 1 verifier correction round.

Linear MCP unauthenticated (only authenticate/complete stubs in deferred-tools) = documented OpenQuestion per §11, non-blocking. verified-green.
