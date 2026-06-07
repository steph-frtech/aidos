---
name: s57-project-switcher
description: S57 project shell (blank-vs-template create) + Workbench project switcher pinning active project_id in AIDOS_PROJECT cookie; verified-green
metadata:
  type: project
---

S57 (app-builder EPIC 1) = the Workbench shell: /projects gains a blank-vs-template create flow + a ProjectSwitcher in WorkbenchHeader (desktop sidebar + mobile bar) that pins the active project_id.

**Done-criterion** (ROADMAP-app-builder:50): "créer deux projets, switcher, vérifier l'isolation + que `__system__` reste isolé." MET — e2e 5/5 proves it.

**Determinism-first core**: `front/web/lib/activeProject.ts` `resolveActiveProjectId(cookie, projects)` is a PURE resolver. `__system__` (SYSTEM_SLUG seed) selectable ONLY by an explicit exact cookie match, NEVER silently preferred — the isolation guarantee. Reproducibility mirror `lib/activeProject.test.ts` Vitest+fast-check 14/14 green (same input→same output, archived/deleted never switchable, system never preferred without cookie).

**Cookie pattern**: AIDOS_PROJECT cookie sibling of NEXT_LOCALE — `document.cookie` write client-side EXACTLY like LanguageSwitcher (ADR 0011 cookie-mode, no URL prefix). The biome warning "Direct assigning to document.cookie not recommended" is a WARNING (not error) and is the established repo pattern (LanguageSwitcher line 20 same) — NOT a S57 scar.

**Header**: WorkbenchHeader is a client component rendered by 48 routes → ProjectSwitcher SELF-FETCHES context via Server Action `switcherContext` (projectSwitcherAction.ts) rather than prop-threading. activeProjectServer.activeProjectContext() reads cookie + snapshot().

**WALL holds**: switching only changes READ scope (S54 scopedSelect / S55 RLS); writes NO truth (grep-clean: zero insert/update into kernel/mirrors/fitness). projects schema is below the wall (append-only, soft-delete only). duplicateProjectAction forks an ISOLATED DAG root (S56 semantics), shares no source node.

**Sensors**: tsc rc=0 clean; vitest 14/14; e2e 10/10 (S57 5/5 + S53 projects.spec.ts non-regression 5/5) on :3000; i18n parity 3337==3337 (new projectSwitcher namespace + projects modeBlank/modeTemplate/source/duplicate keys both FR+EN, zero diff).

**Docs**: steps/concept/s57-project-switcher.mdx + steps/internals/s57-project-switcher.mdx (3 layers Implémentation·Méta·Méta-méta), registered docs.json:181-182, mint validate passed, pushed fd27abd HEAD==origin/main.

**Code commit**: 94d8de7 on build/s00-s47 (11 files: 5 new front + WorkbenchHeader 9-line edit + ProjectsPanel/actions extend + i18n).

**SCAR avoided**: biome WorkbenchHeader:288 useKeyWithClickEvents suppression warning is PRE-EXISTING (commit 295112e nav-drawer, NOT S57) — same as recorded in S54/S55 entries (was line 280, now 288 after the 9-line ProjectSwitcher insert).

**OpenQuestions (forward-deps, non-blocking)**: (1) canonical single door = project MCP over S58 HTTP/API gateway (switcher uses cookie+snapshot path for now); (2) broad panel cutover to live project-scoped reads = S59 (cutover-of-fixtures) — most panels don't yet consume active project_id; (3) Linear MCP not loaded as deferred tools this session — step issue not moved, recorded as OQ per best-effort rule.

verified-green, ZERO corrections.
