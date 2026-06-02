---
name: verification-recipe
description: Concrete commands to independently re-verify an AIDOS KRD step (back Go + front + docs + Linear)
metadata:
  type: project
---

The fast path to re-verify a step without trusting the executor report.

**Why:** the contract says never trust the report on its word; re-run the actual sensors.
**How to apply:** from `/data/dev/aidos/back` (cwd resets between bash calls — use absolute or `cd` compound):

- Go: `go build ./<pkg>/ && go vet ./<pkg>/ && go test -count=1 ./<pkg>/` (use `-count=1` to defeat the test cache — a cached `ok` is not a fresh proof).
- Prior-green: `go test ./kernel/... ./archive/...` catches regressions across subsystems.
- Front mirror: `cd /data/dev/aidos/front/web && npx vitest run lib/<x>.test.ts`.
- e2e: `cd /data/dev/aidos && PLAYWRIGHT_WEB_PORT=3100 npx playwright test tests/e2e/<x>.spec.ts --reporter=line` (Playwright config has a webServer that boots Next on the given port; ~10s).
- Docs live: `curl -s -o /dev/null -w "%{http_code}" https://aidos.mintlify.app/steps/concept/s<NN>-* ` and `/steps/internals/...` (expect 200/200); internals must contain `Méta-méta` (grep the .mdx in `.aidos-docs/`); both registered in `.aidos-docs/docs.json`.
- Linear: `mcp__linear-server__get_issue` with `AID-<n>` (the S09 issue was AID-12) — status must be `Done` only if truly green.
