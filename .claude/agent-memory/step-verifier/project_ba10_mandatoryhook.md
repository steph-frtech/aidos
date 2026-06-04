---
name: ba10-mandatoryhook
description: BA10 HooksSatisfied — turn-acceptance gate over mandatory hooks (VERTS not present), verdict from hook BINARY not transcript; verified-green
metadata:
  type: project
---

BA10 = the HOOK axis of turn-ACCEPTANCE, distinct from the four wall axes (zone/capacity/skill/confinement which gate what an action may TOUCH). BA10 gates whether a TURN may be ACCEPTED.

`HooksSatisfied(impl, []HookVerdict) -> *BlockReason` pure total two-pass: returns nil IFF every `impl.Hooks` with `Mandatory:true` has a `HookVerdict` with `Ran && Green`. Missing/un-ran ⇒ AGENT_MANDATORY_HOOK_SKIPPED (reported FIRST, before red); ran-but-not-green ⇒ AGENT_MANDATORY_HOOK_RED (presence ≠ green). Non-mandatory hooks never block. Verdict comes from the hook BINARY's own `HookVerdict{Phase,Hook,Ran,Green}` record, NEVER the agent transcript (CLAUDE.md §8 — the judge is deterministic). Go + verbatim TS twin (`hooksSatisfied`/`HookVerdict` in lib/agentlayer.ts, namespace lowercase `agents`). 2 new S13 codes in both Go registry + TS consts.

Mirror = hooks_property_test.go (rapid, 7 props + TestFaultInjection_HooksSatisfied_RemoveOrRedFlipsRed): remove a mandatory hook's verdict→SKIPPED, redden→RED — proves hook-honesty §5. Wall holds vacuously: pure below-line predicate, no DB/clock/rng/I/O, no agent run, no truth write.

Action-capable /agents: hook-gate probe inside impl-viewer with fault-injection select (none/skipped/red) executing hooksSatisfied; 4 BA10 e2e assert the BlockReason CODES (semantic, not just visible text).

**SCAR (recurring) — shared-viewer button-count regression:** the BA06 test "implementation viewer ... not a layer" asserts `viewer.getByRole("button").toHaveCount(N)`. Every BA step that adds a probe button inside impl-viewer (BA07 cap, BA08 skill, BA09 path, BA10 hook-gate) MUST bump this count. BA10 left it at 3 → e2e red (count 4). Fix = bump to 4 + add `hook-gate-run` to the enumerated visible controls. WHEN a future BA step adds a 5th probe, expect this same stale-count failure. See [[project_ba09_confinementaxis]].

Verified-green: go build/test agentimpl+blockreason ok, gofmt+vet clean, go build ./... EXIT 0, tsc EXIT 0, vitest agentlayer 67/67, biome 4 files EXIT 0 (only pre-existing BA03 isKnownModel useOptionalChain warning), Playwright agents.spec 37/37 on live :3000 after count fix. Docs 4ea9ef9 == origin/main, mint validate passed, 2 docs.json refs, 3 internals layers. Linear MCP unauth = OQ. Real hook-binary verdict wiring + GateAction composition = BA13+ forward-dep OQ.
