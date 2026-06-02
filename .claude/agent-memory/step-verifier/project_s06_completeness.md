---
name: project-s06-completeness
description: S06 builds mirrors.mirror_record (the typed Mirror) + the completeness law (no_truth_without_mirror / no_orphan_mirror) as a pure Go core + TS port; verified-green pattern
metadata:
  type: project
---

S06 gives the Mirror a typed `mirrors.mirror_record` row (five KRD §34 fields: reflects layer_id+version, test_kind, cert_language, authority, liveness) and makes the completeness law mechanical: `no_truth_without_mirror` (every kernel layer has a living mirror of each required test_kind, read from the recorded §90 profile — never invented) + `no_orphan_mirror` (reflects target exists @version). `IsLiving()` = alive AND cert_language executable (prose is non-executable → does not count, KRD §805). Verdict computed FROM the monster set, never a self-satisfied boolean (anti-Goodhart).

**Why:** this is the step that BUILDS the `mirrors` schema (the forward-dep S00–S05 deferred to). So S06's own BDD mirror is still materialized as file + Godog test (bootstrap exception) — Postgres persistence of mirror *rows* is via the aidos CLI/changeset engine (S20), an OpenQuestion not a blocker. The Stop-time enforcement hook (the binary that calls ComputeCompleteness and blocks a changeset) is deferred to its own later tooth — S06 ships only the predicate.

**How to apply:** verified-green pattern, no corrections needed. Proof shape mirrors S02/S04/S05: pure Go core (records.go) + Testcontainers DB tests (wall: agent SELECT only, INSERT/UPDATE/DELETE/TRUNCATE denied; content-addressed CHECK id=version=content_hash; append-only superseded_by) + rapid reproducibility/invariant properties + a pure TS port (lib/mirror-health.ts) mirrored by vitest/fast-check, feeding an action-capable /mirror-health (Server Action runs the law, reads only — wall respected). e2e on port 3100 (see [[project_playwright_port_targeting]]; 3000 404s). Linear AID-44 Done. Docs pushed fe3aabd.
