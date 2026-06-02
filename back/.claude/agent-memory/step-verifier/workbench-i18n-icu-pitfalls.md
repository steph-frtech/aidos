---
name: workbench-i18n-icu-pitfalls
description: Two recurring next-intl/ICU bugs that 500 a Workbench route and are caught only by the e2e (the heading test false-positives on Next's error page).
metadata:
  type: project
---

When verifying a Workbench `/route` page (`front/web/app/<route>/page.tsx`), a 500 server error from next-intl renders Next's own error page — whose `<h1>` can make a naive "page heading visible" e2e a FALSE POSITIVE. Always run the full e2e spec, not just the heading assertion; and `curl`/load the route if in doubt.

**Two recurring root causes** (both fixed in S11's fr.json/en.json + page.tsx):

1. **ICU literal-brace bug** — a message string containing `{ cart, user }` is parsed by next-intl/ICU MessageFormat as an argument (`INVALID_MESSAGE: INVALID_ARGUMENT_TYPE`). Escape literal braces with ICU single quotes: `'{ cart, user }'` in both `messages/{fr,en}.json`.
2. **t.rich tag-vs-value bug** — `{code}` value placeholders passed `t.rich` tag *functions* throw "Functions are not valid as a child". Use the repo convention: `<code>kernel.control</code>` tag form with a single `code` tag fn (matches /operation, /wall, /sensors footers).

Also: render boolean fixture cells as locale-neutral `String(visible)` (true/false), NOT `t("yes")/t("no")` (localized vrai/faux) — the computational truth is locale-independent and the e2e asserts true/false.

**Why:** these 500 silently unless the e2e exercises real content; the heading test alone passes on the error page.
**How to apply:** for any UI step, after reading page.tsx grep the route's i18n keys for raw `{ ... }` braces and `t.rich` usage; run the full Playwright spec on :3100; confirm a PASS badge / data-testid the error page would NOT have.
