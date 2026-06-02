---
name: reality-mirror-one-way
description: S43 RealityMirror — Incident→Idea only; ToKernel ALWAYS blocks (REALITY_CANNOT_DECLARE_TRUTH); incident type makes version/mirror unrepresentable.
metadata:
  type: project
---

S43 (back/runtime/reality) is the external loop: Observe → Learn → ToIdea (single outward edge to S27 ideas.Idea draft) and ToKernel which ALWAYS returns *blockreason.BlockReason (never nil, never a kernel write), code REALITY_CANNOT_DECLARE_TRUTH.

**What to verify on reality-style "X cannot declare truth" steps:**
- The gate fn returns a non-nil BlockReason for EVERY input (rapid prop `TestProp_ToKernel_AlwaysBlocks`), never a kernel write — that one-way asymmetry IS the done criterion.
- The Incident/candidate type makes version+mirror UNREPRESENTABLE (no such field); fixture+property assert the canonical JSON body contains no `"version"`/`"mirror"` key.
- proposes is inferred ONLY when the signal pins it (operation ref → ProposesOperation); else UNSET + OpenQuestion, never guessed (CLAUDE.md §8 honesty). The UI must render `idea-proposes` only when pinned (e2e asserts count 0 when unpinned) — an OpenQuestion marker instead.
- New blockreason code is an additive closed-enum extension: appended to `codeOrder` + a registry entry with non-empty how_to_fix; S13 enum-driven property auto-covers it.
- Migration re-asserts the wall at row level: GRANT SELECT/INSERT/UPDATE on incidents.*, SELECT on telemetry.*, and REVOKE writes on kernel/mirrors/fitness — observable reality, unwritable truth.

**Why:** the whole point is reality proposes, never governs. A nil return or a kernel write would be the monster.

**How to apply:** confirm the gate prop holds over arbitrary inputs, the FR BlockReason twin in front/web/lib matches the Go For() output verbatim, and there is deliberately NO incident_to_kernel MCP tool. See [[gate-conjunct-wired-upstream]] (related: feed-only steps) and [[sandbox-confinement-allow-list]] (S42 cannot-govern).
