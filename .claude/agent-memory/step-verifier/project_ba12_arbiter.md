---
name: ba12-arbiter
description: BA12 determinism-first ARBITER — pure structural classifier (intent by structure not label), Go+TS twin, verified-green
metadata:
  type: project
---

BA12 = the determinism-first ARBITER of the governed build-agent. `back/runtime/agentimpl/arbiter.go` encodes the determinism-first SKILL mapping table IN CODE (diff→jj/Myers, search→rg, format→biome/gofmt/go-arch-lint, codegen→S34 emitters, validate→kernel validators).

**Core invariant (done-criteria):** `classify()` reads ONLY (Tool, Args), NEVER DisplayedIntent — re-labelling cannot change the verdict, only structure can (gap D1). If a deterministic tool exists for the structure, `Arbitrate` NEVER returns LLMGated (gap D3). LLMGated is the RESIDUAL (irreducible generation only). `ArbitrateGated` returns the S13 `AGENT_DETERMINISM_GAP` BlockReason IFF `RequestedLLM && Kind==DeterministicTool` (an agent doing what a pure function could).

**Pure/total/deterministic:** arbiter itself is the thing it enforces — no DB/clock/rng/LLM, reproducibility mirrors (rapid + fast-check) pin same-input→same-output. The classifier that enforces determinism-first is itself deterministic.

**Verified green:** Go 8 tests (agentimpl+blockreason); full ./runtime/... ok (prior-green intact); go build clean. TS twin agentlayer.ts arbitrate/arbitrateGated verbatim match of Go classify (incl. git/jj diff-only, go fmt-only). tsc 0; vitest 80/80 with semantic BA12 coverage (relabel-inert, gap-blocks, generation-not-gap). Action-capable /agents arbiter-gate (action select + label input + LLM checkbox + run); e2e 45/45 on :3000; button-count SCAR bumped 5→6 for arbiter-gate-run probe. Mintlify both pages + 3 layers + mint validate + pushed origin/main 9f73019.

**Report-prose miscounts (cosmetic, not blocking):** report said "11 arbiterGate keys / vitest 80/80 (+7) / e2e 45/45 (+5)" — actual is 10 arbiterGate keys (both locales aligned, no i18n leak), vitest 80/80, e2e 45/45. Numbers in prose drifted; artifacts are correct.

**Biome 3 warnings** at agentlayer.ts:551/557/902 are PRE-EXISTING (BA07/earlier useOptionalChain), NOT in the BA12 arbiter block (1096+) — durable, not introduced by BA12.

**OpenQuestions (by-design fwd-deps, NOT residual):** (1) the loop that CONSULTS ArbitrateGated before each action is BA16/BA27 (loop shell) — BA12 only CLASSIFIES. (2) Linear MCP unauthenticated (OAuth).
