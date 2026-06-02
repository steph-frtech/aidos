---
name: s12-completeness-stop
description: S12 turns S06's read-only completeness verdict into a non-bypassable Stop gate (block iff monsters); verified-green
metadata:
  type: project
---

S12 — la complétude/monstre devient mécanique au Stop. The bicephalous law (S06) stops being a read-only verdict and becomes a gate.

**Shape (verified-green):**
- `back/kernel/mirror/completeness/completeness.go` — pure `Gate(monsters, cut) Decision`: block iff |monsters|>0, else pass; no third verdict. `Check(cut)` runs S06's `records.ComputeCompleteness` (CONSUMES it, does not re-derive). `GateErrored` = anti-passthrough INCOMPLETE block (KRD §82). Cut.Hash() = order-independent SHA-256 over sorted layers⋈mirrors.
- `back/hooks/stop/` (package main) — Run(stdin/stdout/CutSource/RunLog): decode Stop event (empty body valid, malformed→fail-closed INCOMPLETE), load cut, Check, record run, exit 0 allow / 2 block; writes BlockReason JSON on block. EmptyCutSource (no-DB fallback) + PgCutSource.
- migration `completeness_runs_baseline.sql` — runtime.completeness_runs + completeness_monster_findings, append-only, verdict CHECK('block'|'pass') + verdict/count CHECK; agent INSERT+SELECT only, REVOKE UPDATE/DELETE/TRUNCATE (below waterline, wall intact).

**Mirrors green:** Godog 3 scenarios (no_truth block, orphan block, complete pass — each asserts a recorded row); rapid 4 properties (block-iff-monsters, exact-set recorded, errored-always-blocks, hash deterministic/order-independent); 5 fault-injection (green→pass, delete-only-mirror→block, repoint-vanished→block, unreadable-event fail-closed, cut-load-error block). Testcontainers 5 DB tests (round-trip, gate-over-real-pg, append-only denials, wall holds, verdict CHECK constraint). Full back suite no regressions.

**UI:** `/completeness` read-only panel (gate is harness-invoked, no headless op → ui-completeness vacuously holds). lib/completeness.ts static declared projection + 9 vitest; e2e 4/4. Note feature file lives at repo-root `tests/mirror/completeness_stop.feature`, Godog path `../../../tests/mirror/...` from back/hooks/stop is correct.

**OpenQuestions (by-design fwd-deps, NOT residual):** rerun-on-demand completeness MCP deferred; goal-check half of the Stop line (red set→green ∧ mutation) inert until S29.

Linear AID-29 Done. Docs a955359 live 200/200, mint validate clean. Verified-green pattern — see [[s06-completeness]] for the detector this consumes.
