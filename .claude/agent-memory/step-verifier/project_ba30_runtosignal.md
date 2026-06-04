---
name: ba30-runtosignal
description: BA30 RunToSignal gateway — bridges AgentRun → reality.Signal with identity-by-pattern recurrence (gap I1/I2); verified-green
metadata:
  type: project
---

BA30 = the GATEWAY `RunToSignal(run, thresholds) → (PatternSignal, bool)` in `back/runtime/agentloop/runtosignal.go`: bridges a recorded AgentRun to the S43 reality engine (which had no on-ramp from a build-agent run).

- **Identity-by-pattern (gap I2, load-bearing):** signal identity is content-addressed on the PATTERN key `<class>|<dominant_refusal_code>|<cause_class>`, NOT the run id. `ToObserveInput()` sets `Ref=ps.Pattern` and pattern-derived Signal — no run/goal id/timestamp in the address. reality.Observe hashes `records.Hash(canon)` over a `canonicalBody` whose Ref IS the pattern → two distinct runs of the same failure mode collapse to the SAME incident id → Recurrence climbs. Run/goal id rides Provenance prose, outside the address.
- **gap I1 (green-hollow):** a GREEN run is signalled LOW-severity iff refusals ≥ declared ThrashRefusals OR carries an AGENT_DETERMINISM_GAP refusal. failed/abandoned/blocked → HIGH. Ordinary green → (_, false), no signal invented.
- **Wall (honesty):** CauseSketch is explicit "HYPOTHESIS"/"HYPOTHÈSE" never a truth; reality.ToKernel still returns REALITY_CANNOT_DECLARE_TRUTH; MCP `WroteTruth` always false; gateway holds no DB. incident_derived taint always set.
- **Determinism-first:** pure/total tally+switch (Go authority + TS twin `lib/agentloop-runtosignal.ts`), reproducibility property pins same-input⇒same-output, no LLM/clock/rng.

**Verification:** Go test green (agentloop 11.7s incl 9 rapid props + 6 fixture rows), vitest 11/11, gofmt/vet/tsc/biome all clean, mint validate pass + pushed (HEAD==upstream 961c088). Server on :3000 (NOT 3100/3200 this time) — confirmed serving live `signals` markup before e2e; PLAYWRIGHT_WEB_PORT=3000 → BA30 2/2 green.

**UI wiring note (BA series pattern):** AgentsPanel.tsx takes a typed `labels` prop; the `t()` calls live in `app/agents/page.tsx` under namespace `agents` (NOT a useTranslations in the panel). A naive "extract t() keys from panel" check gives FALSE missing-key positives — instead grep `labels.ba30*` in panel, then confirm those keys exist in BOTH `messages/{fr,en}.json` under `agents` AND are wired in page.tsx. All 13 ba30 labels present + wired.

OpenQuestions (non-blocking): Linear MCP unauth (OAuth+restart). Near-budget-green refinement deferred — AgentRun shape doesn't carry final RunMeter vs caps (by-design minimal scope; green-hollow uses refusal-count thrash + det-gap which the run DOES carry).
