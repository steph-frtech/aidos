---
name: ba28-replay-redact
description: BA28 — AgentRun Replay (re-derive same id via records.Hash) + Redact (closed declared secret-pattern set) with front twin agentrun-redact.ts; both mirrors green, verified.
metadata:
  type: project
---

BA28 makes a recorded AgentRun REPLAYABLE + its transcript SAFE (gap H1).

- `back/runtime/agentrun/replay.go`: `Replay(run)` rebuilds from recorded fields and re-`Record`s → `Replay(run).ID == run.ID` (REUSES records.Hash, not forked); `ReplayMatches` tamper predicate; `Redact`/`RedactTranscript` scrub a CLOSED declared set (conn_string, private_key_header, anthropic_key sk-(ant-)?, github_token gh[poshru]_, aws_access_key AKIA) → `[REDACTED]`, pure/total/deterministic/idempotent. Property mirror `replay_property_test.go` (6 rapid props) green.
- `back/runtime/agentloop/replay.go`: `DriveReplayable` wires DriveWithEconomics (BA27) + stamps agentimpl.Hash, agentrun.SeedFor, content-addressed redacted-transcript ref; `RecordingGenerator` redacts at capture time. Fixture mirror (4) green.
- Front twin `lib/agentrun-redact.ts`: same closed pattern set; FNV-1a `replayId` (UI fingerprint, NOT the Go SHA-256 — it's an id-independent re-derivation); `agentrun-redact.test.ts` 11 fast-check green.
- UI: AgentsPanel `data-testid="replay-redact"` subsection executes the REAL twin fns (redactTranscript/replayId/replayMatches/runSeed/containsSecret), themed + bilingual (ba28* keys in both fr/en); e2e `tests/e2e/agents.spec.ts` BA28 block (2 cases) green. Wall respected: run is below-the-line telemetry, no truth write.
- Docs concept+internals (3 layers) registered, mint validate clean, pushed origin/main fbd4295.

**Verified-green.** Pre-existing UNRELATED failure: `front/web/lib/web-projection.test.ts` (cwd-relative readFileSync of app/web-preview/_generated/checkout-button.tsx) — NOT touched by BA28, last changed in commit 2087884; do not block. Linear MCP unauthenticated → OpenQuestion, not a residual.
