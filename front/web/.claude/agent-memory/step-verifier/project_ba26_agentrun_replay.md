---
name: ba26-agentrun-replay
description: BA26 — AgentRun replay schema extension (Impl/Seed/ProviderTranscript) via supersede-via-version; legacy hash stays byte-stable; verified-green.
metadata:
  type: project
---

BA26 extends `back/runtime/agentrun.AgentRun` with `Impl/Seed/ProviderTranscript` (all `omitempty`) as a NEW @version of the content-addressed body (anti-overwrite §9, not an in-place hash mutation).

Key mechanism verified: `canonicalBody` only adds a replay key when non-empty, so a legacy seedless run hashes byte-identically to the pre-BA26 shape. `LegacyID(r)` reconstructs the pre-BA26 body and the property test asserts `Record(r).ID == LegacyID(r)` for seedless runs. `DeriveSeed(impl,pack,item)=Hash(Canonicalize)` reuses records.Hash; `SeedFor` is declared-wins/derive-fallback.

Migration `back/migrations/agentrun_replay_baseline.sql`: partial indexes `agent_run_seed_idx`/`agent_run_impl_idx` over JSONB body, `agent_run_replay_coherent_chk` CHECK (transcript ⇒ impl AND seed). Wall held: agent role INSERT+SELECT only, REVOKE UPDATE/DELETE/TRUNCATE.

Front twin lib/agentrun.ts REUSES lib/agentlayer.deriveSeed (does NOT fork); adds `runSeed` + `agentRunReplayCoherent`. /agents « Replay envelope » subsection, data-testid `replay-envelope`.

**Why:** Run Testcontainers (`go test -run 'TestRoundtrip|...' ./runtime/agentrun/`, ~9s on postgres:16-alpine) — Docker was available; do NOT trust the property `-short` alone for the migration-roundtrip criterion.

**How to apply:** forward-deps that are OpenQuestions not residual: ProviderTranscript redaction (gap H1) deferred to BA28; FNV-1a UI seed twin is 32-bit vs authoritative Go SHA-256 (front "different input⇒different seed" uses fixed examples, correct). Pre-existing NUL bytes in agentlayer.ts (binary grep) are NOT a BA26 regression — tsc reads UTF-8 and passes. Linear MCP unauthenticated = OpenQuestion. Verified-green.
