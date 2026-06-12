---
name: wb2-14-policy
description: §WB2-14 verification — /v2/policy Policy DSL ALLOW/DENY tree (React Arborist), twin reuse of S09, the one reachability gap fixed
metadata:
  type: project
---

§WB2-14 (after WB2-13) /v2/policy = la Policy DSL (§24.4/§93) rendue ARBRE RÉCURSIF ALLOW/DENY (combinateurs all/any/not au-dessus de feuilles eq/gt/lt/exists/matches) en React Arborist (déplier/replier). Choisir un contexte d'exemple → arbre ÉVALUÉ (chaque nœud HOLD/FAIL) + décision §93 (ALLOW/DENY). Index /v2/policy + écran /v2/policy/[policy], notFound() slug inconnu, slug=nom bijectif.

**Why / How to apply:** verification context for the WB2-14 step.

TWIN lib/v2/policy.ts PURE/TOTAL/DETERM no-LLM RÉUTILISE l'évaluateur S09 lib/policy.ts (holds/evaluate/sélecteurs $-enracinés/loi de combinaison via l'effet, miroir du Go back/kernel/policy) — AUCUNE règle inventée (ADR 0007 no fork). Ajoute: evalTree(rule,ctx)→TracedNode (arbre parallèle, chaque nœud held=holds(n,ctx) donc COHÉRENT avec l'évaluateur, ids content-adressés par POSITION p0/p0.0/p0.1.0… déterministes uniques), arboristTree(rule,ctx?)→forêt React Arborist avec/sans verdict, nodeCounts (combinators/leaves/total), ruleLabel. Registre CLOS POLICIES={canPlaceOrder §93 VERBATIM (réexporté de S09), denySecretField (NOUVEAU: scope FIELD effect DENY rule any([matches($.field,"^secret"), eq($.role,"guest")]))} — denySecretField COUVRE any/not/matches/FIELD/effet-DENY non couverts par canPlaceOrder. samplesFor (canPlaceOrder→SAMPLES S09 réutilisés; denySecretField→deny-secret-field {field:secretNote}→DENY + allow-ordinary-field {field:label}→ALLOW), decisionFor, policySlug/policyBySlug/policySlugs.

MIROIR vitest+fast-check 19/19 (RÉEL re-run, pas de false-green): déterminisme evalTree, racine tracée==holds (ET récursive), ids p0/p0.i uniques, loi §93 canPlaceOrder ALLOW ssi holds, denySecretField DENY ssi holds, PROPERTY DENY-DOMINE (effet DENY ⇒ décision==DENY ⇔ règle tient sur fc.boolean×fc.string), PROPERTY combinateurs (all==∧ enfants/any==∨ enfants sur arbre tracé), PROPERTY not involution (not(not(r)).held==r.held), arboristTree avec/sans ctx, nodeCounts, bijection slug↔nom, ensembles CLOS scopes/8-kinds.

SCREEN page index (liste POLICIES, badge ALLOW/DENY, nodeCounts) + [policy]/page.tsx (generateStaticParams, notFound() slug inconnu) → PolicyClient client-only React Arborist <Tree> openByDefault, toggle déplier/replier, boutons sample (un par échantillon) → setSelectedId → arbre coloré HOLD/FAIL via data-held + décision §93 via data-decision. Tokens ADR0010, bilingue v2Policy 22 keys fr==en. WALL clean: ZÉRO fetch/POST/PUT/PATCH/DELETE, l'écran lit+évalue des échantillons déclarés, n'écrit aucune vérité (grep wall vide hors commentaires; e2e writes===[]).

e2e v2-policy.spec.ts 2/2: (1) canPlaceOrder déplie/replie/redéplie p0, choisit allow-authed→ALLOW data-decision + p0 data-held=true, change deny-empty-cart→DENY + p0.2(gt) data-held=false, writes===[]; (2) denySecretField FIELD/DENY: secret→DENY, ordinaire→ALLOW. Testids tous présents dans HTML servi (vérifié curl :3412, React Arborist nœuds hydratent client-side = pattern établi). 404 sur slug inconnu confirmé.

VERIFIED-GREEN AFTER 2 CORRECTIONS (verifier db40450 pushed):
1. **REACHABILITY gap (ui-completeness)**: /v2/policy était un ÉCRAN ORPHELIN — aucun lien entrant depuis un autre écran V2 (executor n'a PAS branché le geste). FIX: ajouté Link href=/v2/policy data-testid=v2-grille-gesture-policy sur GrilleScreen.tsx (le HUB établi des gestes V2 frères: operations/workflows) + clé bilingue gesturePolicy fr/en (v2Grille 11→12 keys, parité OK). GrilleScreen rendu à /v2/grille ET /v2/verticale.
2. **Biome warning**: type Policy importé inutilisé dans policy.test.ts → retiré.

Après fixes: vitest lib/v2+app/v2 185/185 (166 prior + 19 policy), tsc0, biome CLEAN (8 fichiers), build13.4s ƒ /v2/policy + ƒ /v2/policy/[policy] présentes. DETERMINISM-FIRST: toute la logique pure no-LLM, repro mirror property. DOCS 3-layer concept+internals docs.json:517-518 mint validate PASS commit 21aafe2==origin/main pushed. Code HEAD db40450==origin (executor 0605723 + verifier fix).

OQ by-design (NE BLOQUENT PAS): registre POLICIES statique (pas encore lecture live kernel.policy SELECT rôle-lecture-seule, viendra avec le store — même frontière que tous les écrans V2); Linear MCP unauth (issue WB2-14 non déplaçable); Mintlify index lag.

EXECUTOR REPORT: ACCURATE sur le cœur (185/185+19/19 RÉEL, docs/build/wall corrects) MAIS 2 inexactitudes mineures: (a) "Biome clean" FAUX (1 warning unused import); (b) a OMIS la reachability — /v2/policy laissé orphelin sans geste GrilleScreen, alors que WB2-12/13 (operations/workflows) ont TOUJOURS branché leur geste sur GrilleScreen. SCAR: pour un nouvel écran V2 /v2/<x>, TOUJOURS vérifier qu'un geste entrant existe (GrilleScreen v2-grille-gesture-<x> = le pattern hub) sinon ui-completeness viole (orphan screen = headless-equivalent).
