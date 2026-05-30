---
name: feedback-verify-approach
description: Verification approach for step-verifier: always re-run validators and Playwright directly; never trust the executor's reported pass counts.
metadata:
  type: feedback
---

Always re-run `node tests/validate-contract.mjs` and `npx playwright test` directly rather than trusting the step-executor's reported counts.

**Why:** The executor report is a claim, not a proof. The harness requires the verifier to independently confirm green status.

**How to apply:** At every step, run the computational mirror runner and the Playwright suite. Also run `npx tsc --noEmit` and `npx biome check` on changed files as the sensor check.
