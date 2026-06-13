---
name: dp06-envbindings
description: DP06 verified green after 1 trivial fix (stale comment) — env set widened 3→5 additively, A1 gate prod+doltgres refused, ADR-before-mirror order held, biome scar did NOT recur
metadata:
  type: project
---

DP06 (Environment set 5 + per-env bindings + A1 Doltgres-non-prod gate) verified green, 1 correction.

**What held (executor report ACCURATE, near-zero gap):**
- ADR 0065 accepted BEFORE code (A1 order respected, authority = SPEC-stack-2026 verbatim); same ChangeSet covers all A6 items (environmentOrder prefix-preserved, ValidateShape msg, IsKnownEnvironment, property test 3→5, migration roundtrip jsonb no-DDL, SemanticDiff refine-never-override via S21 reused).
- Hash pin aaca11ab… genuinely cross-derived: rapid pins it AND TS twin re-derives it with its OWN canonicalizer (vitest L1) — two independent impls, real byte parity.
- Go tests green incl. Testcontainers (wall GRANT SELECT-only proven), gofmt/vet clean; vitest 2115/2115; tsc 0; build OK; e2e 36/36 live by me on :3210 (4 new + v3 16 + 4×4 DP regressions), prod :3000 intact.
- **Biome scar did NOT recur**: noTemplateCurlyInString pre-suppressed with reasons in lib AND e2e spec (DP05's miss fixed); biome truly clean on all 8 files (re-run by me). No .fail committed (DP04/DP05 scar absent). Git clean, no stray binaries.
- Docs: 2 pages 3-layers, docs.json:571-572, mint validate+broken-links clean (re-run), 81739c4==origin/main, both URLs 200 live.

**Correction applied (05aa20d):** stale doc-comment in scope_property_test.go said "environment 3" while assertion is 5 — fixed, committed, pushed.

**Why:** DP-track executor discipline has converged — the recurring scars (biome ${VAR}, .fail files, false "clean" claims) are now pre-handled. **How to apply:** still re-run biome + grep .fail every DP step, but expect clean; watch for stale COMMENTS when a closed set's cardinality changes (grep the old number near the new assertion).

**Standing facts:** validation_humaine STILL 0 hits in lib/v2 (user req 2 not yet built — future DP step, not a regression; contract says "if exists already"). Linear MCP unauthenticated (recurring OQ, never residual). future_cloud managed palette deferred to EPIC G (OQ inherited from ADR 0006, documented in 0065).
