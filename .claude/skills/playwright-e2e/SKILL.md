---
name: playwright-e2e
description: >
  Conventions for writing, fixing or reviewing Playwright end-to-end tests for the
  AIDOS Workbench. Triggers when talking about e2e tests, Playwright specs, a user
  flow to test, or selectors / flaky tests.
allowed-tools: Read, Write, Edit, Bash, Grep, Glob
---

# Playwright E2E (AIDOS Workbench)

## Rules
- User-facing selectors first: `getByRole`, `getByLabel`, `getByText`.
- No fragile CSS/XPath unless unavoidable. `data-testid` only when no stable semantic selector exists.
- Cover critical business flows first (one per KRD panel: Mirror Health, Goal Red Set, ChangeSets, Version DAG, …).
- Deterministic, independent tests: no shared state, no implicit ordering.
- Traces/screenshots/videos only via config, never ad hoc.
- The dev server is started by the `webServer` block in `playwright.config.ts` (baseURL `http://localhost:3000`) — do not start it by hand.
- Waits: `await expect(locator).toBeVisible()`, never `waitForTimeout`.

## Commands
- All tests: `npm run test:e2e`
- One file: `npm run test:e2e -- tests/e2e/<flow>.spec.ts`
- UI mode: `npm run test:e2e:ui` | Debug: `npm run test:e2e:debug` | Report: `npm run test:e2e:report`

## Expected output
1. The user flow covered (1 sentence).
2. The spec created/modified.
3. The exact command run or proposed.
4. Any flakiness risk.
