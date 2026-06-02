---
name: feedback-i18n-keys-missing
description: Recurring S-step gap — page.tsx t() calls keys absent from messages/{fr,en}.json; e2e by-testid passes anyway, masking the break
metadata:
  type: feedback
---

When verifying a Workbench route, ALWAYS cross-check every `t("key")` call in `page.tsx` / the client component against BOTH `front/web/messages/fr.json` AND `en.json` under the route's namespace.

**Why:** S18 shipped with the four `truthTree.scenario*` keys missing from both message files while `page.tsx` called them via `t()`. next-intl errors / renders an error placeholder on a missing key in production. The Playwright e2e selected the toggle buttons by `data-testid`, so it passed 6/6 and the gap was invisible to the e2e. The step-executor's memory even claimed "~24 keys × 2 langues added" — the report was wrong; only re-reading the JSON caught it.

**How to apply:** quick check —
`node -e "const m=require('./messages/fr.json'); const want=[...]; console.log(want.filter(k=>!(k in m.NS)))"`
for both locales, listing every key the page references. A green e2e is NOT proof of complete i18n when selectors are testid-based. Biome won't catch it (valid JSON). This is a blocking, fixable-now gap — add the keys (FR + EN) before passing.
