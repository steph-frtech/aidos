---
name: s27-ideas
description: S27 Idea lifecycle — only door to kernel; promote needs mirror+goal; version/mirror unrepresentable by type
metadata:
  type: project
---

S27 = the Idea record + lifecycle as the ONLY door into the kernel.

- `back/kernel/ideas/ideas.go`: `Idea{ID,Proposes,Intent,Provenance,Status,RejectReason}` — NO Version, NO Mirror field (double absence unrepresentable by type = what makes it an idea, not a truth). ID = content hash of sketch `{proposes,intent,provenance}` reusing S01/S02 records.Hash; Status excluded from address (lifecycle metadata, id stable across transitions).
- `lifecycle.go`: pure total gestures Capture/Grill/Spike/Harvest/Reject + Promote GATE. Closed 5 statuses draft→grilled→{spiking→harvested|harvested}, reject from any non-terminal (append-only, kept). Promote refuses unless harvested ∧ non-empty mirrorRef ⇒ NO_MIRROR_NO_KERNEL (how_to_fix=write_mirror_run_goal_freeze), idea stays harvested, no mutation.
- `back/hooks/promotion-gate`: PreToolUse hook DEFERS to ideas.Promote (no re-impl), fails closed on garbage, fires only on Schema=="kernel"; fault-injection proves mirror-less promotion → deny exit 2.
- `back/mcp/idea-intake`: 7 tools capture/grill/spike/harvest/reject/status/list — deliberately NO idea_promote_to_kernel bypass.
- Migration `ideas_lifecycle_baseline.sql`: expand-only status CHECK + GRANT INSERT/SELECT/UPDATE (no DELETE) to aidos_agent on ideas.idea (staging ABOVE wall); re-REVOKEs writes on kernel/mirrors (wall intact). Testcontainers round-trip test proves it.
- Front `/ideas`: read-only projection (ui-completeness vacuous on write-path — capture/advance via MCP, promote via S20 ChangeSet) + pure twin lib/ideas.ts (promote gate) + fast-check 8/8. Action-capable for the gate demo (both promote paths run the same pure promote()).
- OpenQuestions (by-design forward deps, NOT residual): no real kernel freeze yet (S29 /goal wiring), no MemoryFirewall/ContextPack intake (S30 §119.1), promotion-gate uses injected has-mirror predicate.
- Verified-green: go test 0 fail, gofmt/vet clean, vitest, biome, tsc 0, Playwright 5/5 on :3000, mint validate pass, docs pushed origin/main a1c5afb, Linear AID-20 Done.
