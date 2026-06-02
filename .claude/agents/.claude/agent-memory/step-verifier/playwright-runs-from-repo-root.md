---
name: playwright-runs-from-repo-root
description: Workbench e2e specs live at repo-root tests/e2e/ with playwright.config.ts at repo root; run `npx playwright test <name>` from /data/dev/aidos, never from front/web
metadata:
  type: project
---

The Playwright config (`playwright.config.ts`) and the e2e specs (`tests/e2e/*.spec.ts`) are at the **repo root** (`/data/dev/aidos`), not in `front/web`.

**Why:** Running `npx playwright test <name>` from `front/web` finds "No tests found" (no config there), and a bare filter token like `context-pack` can accidentally match the **vitest** twin (`front/web/lib/context-pack.test.ts`), which then errors importing from `vitest` under the playwright runner. The vitest twin and the playwright e2e share a base name.

**How to apply:** To verify a step's e2e, run from `/data/dev/aidos`: `npx playwright test <step-name>.spec --reporter=line`. Use the `.spec` suffix in the filter so it does not also pull the vitest lib test. Front twin vitest runs separately from `front/web`: `npx vitest run lib/<name>.test.ts`.
