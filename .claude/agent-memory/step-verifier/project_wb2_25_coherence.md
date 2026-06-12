---
name: project-wb2-25-coherence
description: §WB2-25 PASSE DE COHÉRENCE finale Workbench V2 — registre écrans déclaré + lint vocabulaire + nav complète + bascule prod /v2 ; verified-green zero corrections
metadata:
  type: project
---

# WB2-25 — la passe de cohérence V2 (le cran de fermeture)

WB2-25 = dernier cran code du Workbench V2 (3e après WB2-23/24 docs-only). NON docs-only : il livre code + e2e + docs. C'est la PASSE DE COHÉRENCE : nav V2 complète + lint vocabulaire (le bon mot partout, aucun franglais).

**Done-criteria (4, TOUS MET, vérifiés LIVE par moi):**
1. lint vocabulaire 0 écart — `lintScreens(SCREENS,'fr').clean===true`, vitest 10/10
2. e2e V2 complète verte — `tests/e2e/v2-coherence.spec.ts` **23/23 GREEN re-run live PORT=3458** (coexistence /v2 200 ∧ / 200, section « Tous les écrans » + hash, 20 routes /v2/<slug> chacune 200)
3. build + déploiement V2 live — next build GREEN, /v2 200 sur Traefik aidos.sagedesk.fr + local :3000, section v2-all-screens servie en HTML prod
4. l'ancien Workbench/doc toujours 200 — / 200, old docs wb2-22+glossary 200 sur mintlify (non-régressé)

**Deliverables:**
- `lib/v2/screens.ts` : REGISTRE déclaré SCREENS (20 entrées = slug+concept+fr/en title) content-adressé `screensHash` FNV-1a 32-bit ; `screen/screenTitle` totales (slug inconnu→undefined) ; `isTotal` pure
- `lib/v2/vocabulary-lint.ts` : +`lintScreens(entries,locale)` + `ALLOWED_PROPER_NOUNS` (goal/policy/dsl/dag/pact/ai/lab/go/ts/ddl/allow/deny neutralisent FORBIDDEN_FRANGLAIS) — pur, no-LLM, ÉTEND sans toucher lintNav
- `lib/v2/screens.test.ts` : miroir Vitest+fast-check 10 tests — totalité, **NAV COMPLÈTE prouvée contre le DISQUE** (`realV2Routes` via readdirSync → declared===real cohérence cardinale, exclut [slug] catch-all et dossiers sans page.tsx), lint 0 écart + anti-faux-négatif (franglais injecté attrapé), déterminisme
- `app/v2/page.tsx` : section « Tous les écrans » testid `v2-all-screens` + `v2-screens-hash` + `v2-screen-<slug>` cartes cliquables (ui-completeness : reachable+executable depuis /v2) ; ZÉRO fetch/POST (mur intact)
- 4 clés i18n v2Shell (allScreensHeading/Subtitle/Hash) fr22==en22

**VERIFIED-GREEN ZERO CORRECTIONS** (tout re-run/re-read PAR MOI) :
vitest screens 10/10 + lib/v2 272/272 (21 files prior-green intact) ; tsc EXIT=0 ; **biome 4 fichiers EXIT=0 réellement clean** (re-run même malgré exit0 — scar respecté) ; build GREEN tous /v2/* ; e2e 23/23 live ; wall grep clean (no fetch/POST/writeFile) ; docs 2 pages 3-layers + « Place dans le cliquet KRD » ; docs.json 553-554 chacune 1× ; mint validate success + broken-links none (re-run live) ; docs d8b8506==origin/main pushed ; mintlify wb2-25 concept+internals 200 live.

**Détermin-first** : registre+lint+hash purs déclarés no-LLM, repro mirror ; nav-complète prouvée contre filesystem RÉEL (readdirSync) pas une 2e liste manuelle. **ui-completeness** : WB2-25 ne développe AUCUNE nouvelle op (passe de cohérence read-only) ; le geste « naviguer vers chaque écran » reachable+executable depuis /v2 e2e-prouvé. **Mur** : décrit/vérifie/navigue, aucune écriture vérité, propose=/goal.

**INEXACTITUDES NON-BLOQUANTES (notées, n'empêchent pas le PASS) :**
- Report dit « 21 screens » / « 21 declared screens » — le registre a **20** entrées = 20 routes page.tsx réelles. `anatomie` correctement EXCLU (route dynamique [kernel], pas de page.tsx statique). Invariant declared===real tient (20=20) → done-criterion MET. Le « 21 » = slip (compte les build-steps WB2-00..22 ?).
- Doc cliquet dit « vingt-et-un crans précédents » — prose, référence la plage de build-steps, non bloquant.
- Code commit a4c8a93 **NON poussé** (origin/build/s00-s47 une commit derrière à 4a9895b). MAIS aucun done-criterion n'exige un push code, et le contrat dit « push only when asked ». Les DOCS sont poussées (mandat). NON résiduel.

**OpenQuestions by-design (non résiduels) :** Linear MCP unauth (RÉCURRENT tous WB2, seul authenticate dispo, jamais residual) ; code-commit-non-poussé (push only when asked) ; Mintlify-lag (ici déjà 200).

**PATTERN passe-de-cohérence/registre-déclaré :** vérifier declared===real contre le DISQUE (readdirSync, exclure catch-all [x] + dossiers sans page.tsx) ; compter les vraies routes `for d in */; [ -f $d/page.tsx ]` ; le « N screens » du report peut être un slip — confirmer par le count filesystem pas le report.

**Report executor ACCURATE+COMPLET** sauf le slip « 21 » (réel=20). Core 100% vérifié, zéro false-green, zéro gap omis. Biome réellement clean (scar « Biome clean FAUX » NE se reproduit PAS ici — comme WB2-21/23/24).
