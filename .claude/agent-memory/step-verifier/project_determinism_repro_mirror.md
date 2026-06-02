---
name: determinism-repro-mirror
description: Determinism-first verification — deterministic-able ops must be authoritative pure functions with a reproducibility mirror (same input → same output)
metadata:
  type: project
---

Every step now carries a **determinism-first** check (CLAUDE.md §6): any deterministic-able capability (parse, validate, hash, diff, count, render) MUST be an authoritative pure function, never an agent/LLM, and MUST have a **reproducibility mirror** (property/Vitest test: same input → same output, idempotent, total on degenerate input).

**Why:** an agent doing what a pure function could is a determinism gap that blocks the step, same severity as a monster or a headless capability.

**How to apply:** when verifying, confirm (1) the transform lives in a pure module (no I/O/clock/rng — I/O stays at the boundary, e.g. the Server Component reads the file, the pure `parseContract` does the rest), and (2) a reproducibility mirror exists and is green. S00's pattern: `front/web/lib/contract.ts` (pure parse+validate) + `lib/contract.test.ts` (18 Vitest assertions). Run it with `npx vitest run <file>` from `front/web`. See [[project_s00_pattern]].
