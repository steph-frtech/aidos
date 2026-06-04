---
name: ba16-postcheck
description: BA16 deterministic POST-CHECK — the dual of BA13 gate; re-checks EVERY action AFTER execution per nature, mirror is the judge
metadata:
  type: project
---

BA16 = the deterministic POST-CHECK (`back/runtime/agentloop/postcheck.go`), the dual of BA13's GateAction (gate decides BEFORE; post-check decides AFTER may-the-claimed-effect-be-ACCEPTED). Pure/total `PostCheck(turn, dec, observed)` over the action NATURE: write/run_mirror→PostCheckMirror (claimed flip accepted only if observed goal.SensorState agrees — the mirror is the judge, §8), propose→PostCheckShape (non-empty Cible AND no sensor flip — a hypothesis is not a truth), read→PostCheckNoOp (no side effect), unknown→PostCheckKindNone refused with new S13 AGENT_POSTCHECK_FAILED (28th code). EVERY action re-checked, not only code-changing ones — an unknown nature is itself a determinism gap.

Drive (BA15) re-checks every allowed action between gate-allow and effect-apply; FinalMeter mirrors the same accept/reject. Key RED mirror: `TestDrive_Property_ResultInvariantToClaimedConfidence` — same claimed flips + opposite observed readings ⇒ opposite results (confirmed=green, claimed-only=still_red). TS twin in `lib/agentrun.ts` (postCheck/observedSensors/POST_CHECK_KINDS), action-capable /agents control postcheck-* with fault toggle (lying observed). Button-count SCAR guard (viewer=7) UNAFFECTED — BA16 control lives in AgentsPanel not impl-viewer. verified-green.

**Verifier scar:** executor report claimed "biome check clean on all 4 front files" + "go build EXIT 0" but BOTH formatters were dirty: biome wanted line-wraps in agentlayer.test.ts, and gofmt flagged drive.go + postcheck_property_test.go (go1.19+ comment-list tab normalization + trailing blank line). `go build` passing is NOT gofmt passing. Always run `gofmt -l` AND `biome check` independently as sensors — see [[feedback_verify_approach]].
