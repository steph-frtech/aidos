---
name: gv05-policy-compiler
description: GV05 compiles a declared policy.yaml → the SAME agentimpl.GateAction (single-sourced equivalence) with tighten-never-widen; verified-green.
metadata:
  type: project
---

GV05 (back/runtime/governance/policy.go): a policy.yaml → GateAction COMPILER. CompilePolicy([]byte) parses (yaml.v3 KnownFields(true)) and PROJECTS the declared surface onto agentimpl.AgentImplementation; GateUnderPolicy calls the EXACT same agentimpl.GateAction — equivalence by construction (single-sourced verdict, not two impls that could drift). referenceSurface() is the structural max declared in ONE place; mustSubset/mustToolSubset + budget-cap check REJECT any widening (host/path/exec/tool/skill outside ref, raised cap, unknown YAML key). Wall always carried via WallForbiddenPaths() — a kernel target trips zone axis under every policy. Pure/total/deterministic, writes no truth.

Mirror: policy_property_test.go (rapid, RED-first compile-red): equivalence, tighten-never-widens, widen-rejected (7 widenings inc. unknown_field), round-trip-deterministic. Twin lib/governance.ts (compilePolicy/gateUnderPolicy/policyAudit, REFERENCE_SURFACE/SAMPLE/TIGHTEN/WIDEN_POLICY_YAMLS) — gate precedence matches Go (zone→path→egress→exec→capacity→skill); twin OMITS the determinism arbitration axis but drawn actions don't set AgentAction so it's consistent. Per-plane reproducibility, not byte-equal. /governance panel compile-policy control; 3 GV05 e2e (15 governance total). verified-green.

**Why:** equivalence is the load-bearing guarantee — GateUnderPolicy literally calls GateAction, so the YAML cannot diverge from the enforcer the OS already runs.

**How to apply:** OpenQuestions (non-blocking, by design): Linear MCP unauthenticated; reference surface is a concrete declared ceiling (forward-dep on a future live CoucheAgent projection). Neither blocks GV05's own done-criteria. RECURRING ENV QUIRK: `grep` via Bash intermittently returns nothing on lib/governance.ts even when symbols exist (stale shell/cwd between calls) — confirm with `python3 -c "'sym' in open(f).read()"` before concluding a symbol is missing. See [[feedback_verify_approach]].
