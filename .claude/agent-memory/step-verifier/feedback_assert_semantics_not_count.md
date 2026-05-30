---
name: assert-semantics-not-count
description: Mirror runners that assert only collection COUNT (length===N) silently pass wrong-but-equinumerous data — pin the named ids/values when the done criteria names them.
metadata:
  type: feedback
---

When a done criterion names specific items (e.g. the five granularity properties minimal/autonomous/visualizable/non-destructive/chainable, or the nine §6 loop phase ids), the mirror must assert the exact named set membership — not merely `ids.length === N` plus uniqueness.

**Why:** A count+uniqueness check passes a contract with five *wrong* ids, so the mirror does not actually bind the done criteria. Found in S00 `tests/validate-contract.mjs`: it asserted `granularityIds.length === 5` and global uniqueness but never that the ids were the named five. A monster-adjacent gap — the mirror looks green but proves less than claimed.

**How to apply:** When verifying any step whose criteria enumerate named items, grep the runner for `.length ===` / `.length ==` and confirm there is a companion `EXPECTED.every(id => ids.includes(id))` (or equivalent) assertion. If missing, add it directly and keep the .feature/Gherkin text in sync with the runner so mirror form and runner do not diverge.

**Note (S00 final pass, 2026-05-30):** The hardened validator now pins both sets by name (granularity ids exactly [minimal, autonomous, visualizable, non-destructive, chainable] and the nine §6 phase ids) — 13/13 green. The S00 done-criteria wording calls the five granularity *properties* "step gates"; do not confuse with the per-phase `gate: computational|human` field. Both are pinned by name, so the criterion is satisfied either reading.
