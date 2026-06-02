---
name: frontend-lib-twin
description: Workbench pure-logic twins of Go engines live in front/web/lib/, with a fast-check vitest beside them; vitest only discovers lib|app|components **/*.test.ts
metadata:
  type: project
---

The Workbench mirrors each below-the-line Go engine as a pure TS twin so the screen runs the same deterministic verdict the Go engine runs (determinism-first).

**Convention:** the twin is `front/web/lib/<name>.ts` with its vitest `front/web/lib/<name>.test.ts` (and optional `<name>-data.ts` fixtures). `app/<route>/page.tsx` is a Server Component that imports `@/lib/<name>` and `@/components/<Name>Panel`.

**Why:** `front/web/vitest.config.ts` `include` is `["lib/**/*.test.ts","app/**/*.test.ts","components/**/*.test.ts"]`. A test placed elsewhere is silently not run. A prior scar (S29/S30 memory note) was a missing `@/*` resolve.alias in vitest.config — if a twin test errors with "Cannot find package '@/lib/...'", check resolve.alias.

**How to apply:** To verify a Workbench step's twin test, run `npx vitest run lib/<name>.test.ts` from `front/web`. Confirm the page imports the twin and the panel binds every step op to a control (data-testid) the e2e drives.
