---
name: s12-completeness-stop-gate
description: S12 verification — the completeness law turned into a Stop GATE that blocks on any monster
metadata:
  type: project
---

S12 = the Stop completeness GATE (KRD §29 loi de complétude; §74/§77 Stop line; LIVRE XXII §126-§127 chasse au monstre). Turns S06's read-only verdict into a non-bypassable Stop block.

**Done-crit (all met, computed-green):** (1) detects both monster reasons — CONSUMES `records.ComputeCompleteness(mirrors,layers)` from S06, does NOT re-derive; (2) Stop hook blocks on any monster — `Gate(monsters,cut)` blocks IFF |monsters|>0, no third verdict, BlockReason code MONSTER; (3) fault-injection proves it fires.

**Architecture:** PURE `completeness.go` — `Gate` (block-iff-nonempty, returns Decision never bool-it-satisfies = anti-Goodhart), `Check` (consumes S06 detector), `GateErrored` (anti-passthrough KRD §82: errored/unreadable check BLOCKS code INCOMPLETE, never silent pass), `Cut.Hash()` SHA-256 sorted+order-independent. Stop hook `back/hooks/stop` thin adapter: DecodeEvent fail-closed, CheckCompleteness load→gate→record, exit 0=allow 2=block, writes BlockReason JSON. PgCutSource reads head layers+mirrors (superseded_by IS NULL) SELECT-only; PgRunLog appends to runtime.completeness_runs+child findings.

**Migration completeness_runs_baseline.sql:** runtime schema BELOW waterline (S05) — agent INSERT+SELECT only, REVOKE UPDATE/DELETE/TRUNCATE; verdict CHECK IN(block,pass) + verdict/monster_count CHECK (pass⇒0); FK findings→runs.

**Tests RAN GREEN -count=1:** hooks/stop 12.157s (5 fault-injection green-passes/delete-mirror-blocks/repoint-vanished-blocks/unreadable-fail-closed/load-error-blocks; Godog 3 scenarios; 5 Testcontainers pg16 round-trip+real-PG-gate+append-only-agent-UPDATE/DELETE/TRUNCATE-denied+wall-holds mirrors.mirror_record-INSERT-denied+verdict-CHECK-rejects-third) + completeness 0.009s (rapid BlockIffMonsters/RecordsExactSet/ErroredAlwaysBlocks/CutHashOrderIndependent). gofmt/vet/`go build ./...` clean.

**Front:** lib/completeness.ts byte-faithful twin (gateVerdict pure, SAMPLE_BLOCKED_CUT 2 monsters one-each-reason, verdict map block="BLOCKED — MONSTER" pass="COMPLETE" matches e2e), /completeness READ-ONLY projection (ui-completeness VACUOUS — gate enforced by harness hook not screen, no headless cap), vitest 9/9, tsc clean, biome clean 3 files, i18n 3441==3441 zero orphans (completeness 27==27), nav WorkbenchHeader:96, e2e 4 tests (no_truth checkout-button@v1+fixture, orphan liveness dead, BLOCKED—MONSTER+howtofix, complete COMPLETE empty).

**Docs:** concept+internals s12-completeness-monstre.mdx, 3 layers (Implémentation/Méta/Méta-méta), docs.json:93-94 (was :91-92; index shifts as later steps register), mint validate PASS, .aidos-docs 0-ahead pushed.

**RE-VERIFY 2026-06-07 (2nd pass):** still green — completeness 0.008s + hooks/stop 11.6s + besoin-gate 0.009s; gofmt/vet clean; S06 records prior-green 9.7s; vitest 9/9; i18n completeness 27==27 keys (raw grep 11 vs 38 = substring noise, use Object.keys not grep -c). NOTE: back/hooks/stop/main.go now ALSO runs goal-check FIRST (S29 ADDITIVE half via goalSource seam, default NoGoalSource = no-op) — that is S29's wiring layered onto the same binary, NOT an S12 gap; completeness half unchanged. ZERO corrections.

**Code commit:** d894386 (S15→S29 truth core batch — S12 included, not redone, prior-attempt-verified).

OQ by-design (NOT residual): live Postgres wiring of /completeness panel = OQ-S12-3 (sample renders meanwhile); completeness MCP rerun-on-demand = OQ-S12-1; Linear MCP unauth (S12 issue couldn't flip to Done from session).

VERDICT: verified-green, ZERO corrections.
