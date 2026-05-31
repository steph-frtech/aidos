---
status: accepted
---

# Bilingue par défaut : français d'abord + une seconde langue (i18n, tables Postgres)

The AIDOS product — the **Workbench** and **every app AIDOS emits** — always offers **two
languages**, with **French as the default and fallback** and a second language (English) available.

## Decision

- **Static UI strings (Workbench):** **next-intl** in **no-i18n-routing** mode — the locale is
  read from a **cookie** (`NEXT_LOCALE`, default `fr`), **not** from a URL prefix. So existing
  routes (`/contract`, `/store`, …) are **unchanged**, the live deployment and the S00/S01 route
  contracts hold, and a **language switcher** just sets the cookie. Strings live in
  `front/web/messages/fr.json` + `en.json`; `fr` is the fallback.
- **Dynamic / content strings:** a Postgres **`i18n` translation table** (`key, locale, value`,
  PK `(key, locale)`), with a **French row required** and `fr` fallback on lookup. Any
  entity-owned or user-authored text is translatable through this table — not hardcoded.
- **Emitted apps inherit the same pattern**: next-intl (or the target's equivalent) + an `i18n`
  translation table on their **Doltgres** datastore (ADR 0006), French default.
- The standing rule is imposed in the gesture skills (`view`, `action`, `entity`, `project`),
  CLAUDE.md, and the product guide (`guide/your-app`): **propose toujours deux langues, FR par défaut.**

## Considered options

- **Locale-prefixed routing** (`/fr/...`, `/en/...`) — rejected: it rewrites every route, breaks
  the live `aidos.sagedesk.fr` deployment and the S00/S01 `/contract`,`/store` route contracts.
- **Single language** — rejected: the product must always offer two.
- **i18n only in files (no Postgres)** — rejected for content: dynamic/entity text must be
  translatable as data (the truth-store/Doltgres pattern), not baked into code.

## Consequences

- `front/web` gains `next-intl`, `messages/{fr,en}.json`, an `i18n/request.ts`, a provider in the
  root layout, and a `LanguageSwitcher`.
- A migration adds the `i18n` translation table (Workbench truth-store; emitters add it to Doltgres).
- `view`/`entity`/`project` specs must mark text fields translatable and ship FR + EN.
- Pairs with [ADR 0010](0010-workbench-design-system.md).
