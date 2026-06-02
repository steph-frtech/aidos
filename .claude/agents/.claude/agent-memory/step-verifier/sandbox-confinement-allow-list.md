---
name: sandbox-confinement-allow-list
description: For confinement/quarantine steps (S42 EvolutionSandbox) verify the classifier fails CLOSED (allow-list) and the hook defers to the pure core, not a re-impl.
metadata:
  type: project
---

Confinement / quarantine steps (S42 EvolutionSandbox `back/runtime/evolve`, and similar wall-adjacent hooks): the pure classifier (`Confine`) must be an **allow-list that fails closed** — an unrecognised path (neither in can_write nor cannot_write) is REFUSED, not allowed. Check that explicitly; a deny-list would leak.

**Why:** the sandbox confines a self-improving loop; a default-allow would let a novel path escape quarantine into the kernel/fitness.

**How to apply:** when verifying such a step, (1) confirm the PreToolUse hook DEFERS to the pure core (`evolve.Confine`) rather than re-implementing the rule — that keeps determinism + one source of truth; (2) confirm the hook fails closed on a decode error (malformed event → deny); (3) confirm the fault-injection test breaks what it watches (active run writing /kernel AND /fitness → deny). Promotion gates here are BINARY (mirror_green ∧ out_of_sample_green ∧ authority) — a red-mirror variant with a HIGHER score must still be refused (anti-Goodhart); verify the UI/twin shows that case as not-promotable. The "no real LLM generator / no real market data" limits are by-design forward MCP seams ([[gate-conjunct-wired-upstream]] style) — OpenQuestions, never residuals.
