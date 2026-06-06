---
name: hr02-compressor
description: HR02 ContextCompressor port — replaceable pure port, byte-lossless reference impl, Go rapid + TS fast-check twin, /context-compression panel; verified-green.
metadata:
  type: project
---

HR02 ships the **ContextCompressor port** (ADR 0035, REPLACEABLE slot): `Compress(prompt)->(Compacted,Handle)` + `Retrieve(Handle)->original` in `back/runtime/context/compressor.go`, with a deterministic byte-lossless `ReferenceCompressor` (reference-replacement: collapse repeated word-spans length 8..1 to `§N` handles, dictionary records each).

- Load-bearing contract / property mirror: `Retrieve(Compress(x)) == Normalize(x)`; handle is a deterministic **fixed point** (Compress∘Retrieve∘Compress == Compress — NOT the naive "recompress compacted == compacted", which is false because the compacted keeps the 1st occurrence verbatim).
- Go rapid mirror `compressor_property_test.go` + TS fast-check twin `lib/context-compressor.test.ts` (5/5) pin the same invariants; twin in `lib/context-compressor.ts`.
- Panel `/context-compression` action-capable (Compresser/Récupérer both run the pure twin from screen; lossless badge `data-lossless`); e2e `tests/e2e/context-compression.spec.ts` 2/2.
- The wall: port is pure (imports only fmt/sort/strings) — no DB/clock/rng/I/O/LLM, writes no truth. Determinism-first: compression is the GATED exception, never authoritative; reference impl is authoritative pure code.

**Why:** HR-series (headroom/context-compression) is the runtime budget-margin track; lossy mode + the headroom sidecar adapter come at HR03/HR04 behind the SAME port (OpenQuestion, not residual). The HR01 spike does NOT graduate — code rebuilt cleanly in back/.

**How to apply:** run Go from `back/` (filter the `agentloop` build glob noise). Linear MCP unauthenticated this session = OpenQuestion, never fail the step on it. Verified-green.
