---
name: hr04-loop-compression
description: HR04 wires the HR02/HR03 ContextCompressor into agentloop.Drive in front of GenerateAction; meter charged measured (compressed) token count; cap never raised.
metadata:
  type: project
---

HR04 (`back/runtime/agentloop/compression.go` + `drive.go`) wires the [[hr02-compressor]]/[[hr03-headroom-sidecar]] ContextCompressor into `Drive` IN FRONT of GenerateAction.

- `MeasureTokens` = pure whitespace token count (NOT an LLM tokenizer — determinism-first); monotone under compress.
- `turnTokenCost(c, turn)`: empty Prompt → declared `Cost.Tokens` (pre-HR04 path preserved); Prompt + nil Compressor → `MeasureTokens(Prompt)`; Prompt + Compressor → `MeasureTokens(Compress(Prompt))`.
- Single wiring point: `meter.Tally(turnDelta(in.Compressor, turn))` in `DriveWithEconomics` pre-call halt.
- `EffectiveTokensCap` byte-identical with/without compression (asserted in `TestDrive_Compression_FitsUnderSameCap_CapNeverRaised`) — the cap is never raised, only the margin under it grows.
- Fixture mirror `compression_loop_fixture_test.go` pins the 4 done-criteria; TS twin `lib/context-compressor.ts` adds `measureTokens`/`replayEconomy`; UI `/context-compression` panel adds `run-replay-economy` button (data-same, data-cap-raised=false); e2e `tests/e2e/context-compression.spec.ts` HR04 block.

**Why:** compression is the gated determinism-first exception (never authoritative — gate verdict invariant, HR03); it extends budget margin, never relieves the cap.
**How to apply:** verified-green. OpenQuestions (non-blocking): Linear MCP unauth this session; real provider binding deferred to BA17 (forward-dependency, ScriptedGenerator still the mock).

**Verifier gotcha:** Bash cwd resets between calls in this harness — always use absolute paths or `cd X && ...` in ONE command. A bare `cd back` then a later `go test` runs from the wrong dir (.aidos-docs) and fails with a misleading "directory prefix does not contain main module".
