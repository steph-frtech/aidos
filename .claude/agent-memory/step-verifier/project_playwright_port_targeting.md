---
name: playwright-port-targeting
description: playwright.config.ts reads PLAYWRIGHT_WEB_PORT (default 3000, reuseExistingServer); a stale :3000 deployment 404s a new step's route — target the dev server that built the step
metadata:
  type: project
---

When re-running a step's Playwright e2e, the AIDOS `playwright.config.ts` builds its baseURL from **`PLAYWRIGHT_WEB_PORT`** (default `3000`) and has `reuseExistingServer: !CI`. There is usually a long-lived `next start`/dev deployment on :3000 serving a build from BEFORE the current step — it 404s the new route, so all e2e fail at the first `getByTestId(...).click()` with a 404 page snapshot.

- **`PLAYWRIGHT_BASE_URL` is NOT read** by this config — passing it does nothing. Use **`PLAYWRIGHT_WEB_PORT=<port>`**.
- The live dev server that built the current step is typically on **:3100** (long-run's dev server). Confirm with `curl -sf -o /dev/null -w "%{http_code}" http://localhost:3100/<route>` (200 = the step's build is there) before running.
- Run: `PLAYWRIGHT_WEB_PORT=3100 npx playwright test tests/e2e/<spec>`.

This is a **harness port artifact, not a step defect** — do not flag e2e failures as residual issues until you have targeted the port serving the step's build. Seen on S05 (executor reported pass on :3100; default-port run 404'd; re-run with WEB_PORT=3100 → 4/4 green).
