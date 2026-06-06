---
name: hr03-headroom-sidecar
description: HR03 headroom sidecar adapter behind HR02 port + gate-invariance theorem; verified-green after gofmt fix.
metadata:
  type: project
---

HR03 = the `headroom` SIDECAR adapter behind the [[hr02-compressor]] ContextCompressor port (ADR 0035, REPLACEABLE slot). `back/runtime/headroom`: SidecarCompressor (forwards to a Sidecar iface) + FakeSidecar (deterministic double delegating to rctx.ReferenceCompressor) + DeriveAction (pure, WHITESPACE-ROBUST token-stream extractor — must be token-stream not line-wise, because Retrieve returns Normalize'd text with newlines collapsed).

**The theorem (done-criterion):** GateAction(DeriveAction(prompt)) == GateAction(DeriveAction(Retrieve(Compress(prompt)))) — verdict (Allowed + DeniedAxis + BlockReason code) invariant to compression. Property mirror was genuinely RED-first (named the syms + called real agentimpl.GateAction before compile; initial line-wise DeriveAction failed). rapid generator varies allow + each deny axis (zone/path/capacity/skill).

MCP `back/mcp/headroom`: headroom_compress / _retrieve / _gate_check (theorem as a tool). Front twin lib/context-compressor.ts gained deriveAction/gate/gateInvariant/sameVerdict; TS gate mirrors ONLY prompt-derivable axes in Go precedence zone→path→capacity→skill (egress/exec/budget/hook out of scope — DerivedAction omits host/exec). DeniedAxis strings + BlockReason codes match Go agentimpl constants verbatim. /context-compression panel got a "Prouver l'invariance du gate" button (run-gate-check) → gate-panel + gate-invariant-badge data-invariant. 10 vitest green, 3 playwright specs.

**Why:** HR04 will wire the compressor into agentloop.Drive before GenerateAction; the theorem proves it changes nothing the gate decides (compression = determinism-first GATED exception, never authoritative).

**How to apply:** verified-green 2026-06-04. Had to gofmt -w two files (import-order + struct-field-alignment) — see [[gofmt-fixture-alignment]]; `go test` passes even when gofmt -l flags them, so ALWAYS run gofmt -l separately. By-design OpenQuestions (NOT residual): real chopratejas/headroom binary not yet a process (FakeSidecar stands in); Linear MCP unauthenticated.
