---
name: wb2-19-whytree
description: §WB2-19 (after WB2-18) /v2/why = le WhyTree (arbre caused_by, FK13/FKE-35.1) d'un symptôme à la cause racine — verifier verdict + scar resolution
metadata:
  type: project
---

§WB2-19 (after WB2-18) NOUVEL écran /v2/why = le WhyTree (l'arbre caused_by, FK13/FKE-35.1, KRD LIVRE XXX): d'un SYMPTÔME (miroir rouge) à la cause RACINE, remontée DÉTERMINISTE sur les arêtes caused_by (inverse de la vague de rouge), hop par hop, rendu React Arborist (fishbone, « 5-pourquoi redressé »).

DONE criteria: twin remontée pure + property déterministe ; un WhyTree sans miroir terminal REFUSÉ ; e2e un symptôme → arbre. TOUS MET.

TWIN lib/v2/why.ts RÉ-EXPORTE trace (FK12 lib/caused-by.ts, ADR0007 NO FORK — trace est PURE BFS nearest-first refus-cycle content-addr, miroir du Go back/kernel/causedby) + AJOUTE whyTree(symptom,edges,opts)→WhyTreeResult: remontée trace projetée en ARBRE (chaque cause un nœud, ids content-addr w0/w0.0…), gate hors-graphe (OffGraphCause verdict reproduced→GREFFÉE sous parent / rejected→ÉLAGUÉE listée dans pruned, anti-confabulation §8), TERMINAISON OBLIGATOIRE en miroir (opts.terminal absent OU mirrorId vide/trim→WHYTREE_NO_MIRROR ; ERR_CYCLE/CAUSED_BY_CYCLE sur cycle, JAMAIS arbre partiel). + arboristWhyTree/verdictLabel/whyTally(nodes,leaves,offGraph,maxDepth)/registre CLOS WHY_CASES (chain/off-graph/cyclic/no-mirror) réutilise CAUSED_BY_CASES de FK12. PUR/TOTAL/DETERM no-LLM (le « pourquoi » LLM hors-graphe n'entre que DÉJÀ vérifié, code juge STRUCTURE).

MIROIR lib/v2/why.test.ts 16 tests fast-check: déterminisme whyTree byte-identique 2×, remontée==chaîne trace (causeIds==chain.causes, aucune inventée/oubliée), symptôme jamais cause, profondeurs parent+1, refus cycle ERR_CYCLE, refus no-mirror WHYTREE_NO_MIRROR (+ mirrorId vide trim), valide→arbre+terminal porté, hors-graphe reproduite greffée pruned=[] / rejetée élaguée pruned=[id] / verdict+why portés, arboristWhyTree w0 cohérent, whyTally offGraph=1, WHY_CASES clos ids uniques+expectRefusal respecté. RÉEL re-run 16/16 + vitest lib/v2+app/v2 240/240 (était 224, +16).

SCREEN page Server 24 KEYS→WhyClient client React Arborist <Tree> openByDefault. ACTION-CAPABLE: choisir symptôme (bouton/cas) → Construire v2-why-build → arbre ; v2-why-reset ; toggle v2-why-toggle-{id} déplier/replier ; tally data-nodes/leaves/offgraph/depth ; v2-why-terminal data-mirror ; v2-why-pruned (élaguées line-through) ; v2-why-refused data-refusal=WHYTREE_NO_MIRROR|CAUSED_BY_CYCLE. ZÉRO fetch/POST (grep clean) mur tient (lit caused_by, n'écrit aucune vérité ; terminaison-miroir = exigence de FORME pas write, promotion via /learn→idée→/goal).

e2e tests/e2e/v2-why.spec.ts 2 tests VÉRIFIÉ LIVE PAR MOI: build 13.5s /v2/why ƒ (125 pages) → next start 3419 → PLAYWRIGHT_WEB_PORT=3419+PLAYWRIGHT_BASE_URL=http://localhost:3419 → 2 passed 2.2s (off-graph: arbre monte w0=checkout-accept data-nodes>0 data-offgraph=1 reproduced greffée moon-phase pruned absente de l'arbre, terminal data-mirror=mirror-anti-recurrence-total-col, toggle w0 déplie/replie w0.0, reset→empty, writes[]=[] ; no-mirror→data-refusal=WHYTREE_NO_MIRROR pas d'arbre ; cyclic→data-refusal=CAUSED_BY_CYCLE pas d'arbre). kill exact pid ss:3419 ; prod:3000 PAS actif ici (000).

REACHABILITY: /v2/why BRANCHÉ au hub GrilleScreen.tsx:113 href=/v2/why testid v2-grille-gesture-why clé v2Grille.gestureWhy fr"Le WhyTree — d'un symptôme à la cause racine"==en"The WhyTree — from a symptom to the root cause". EXECUTOR A AJOUTÉ LE LIEN CETTE FOIS (scar nouvel-écran-orphelin RÉSOLU — 1er nouvel écran /v2/<x> où l'executor branche le hub sans omission). i18n v2Why fr25==en25 (namespace neuf additif).

VERIFIED-GREEN AFTER 1 CORRECTION (verifier 3a6b85d): biome noNonNullAssertion 3 warnings dans why.test.ts (whyCaseById(...)! — pattern QUE why.test.ts, siblings ne l'ont pas). Biome EXIT 0 (warnings PAS errors, non-bloquant) MAIS executor a CLAIM "Biome clean" → nettoyé: whyCaseById(...)! → const x=whyCaseById(...);if(x===undefined)throw → biome 0 warnings exit 0. Après: vitest 16/16+240/240 tsc0 biome CLEAN build13.5s.

DETERMINISM-FIRST: whyTree authoritative pure-function (trace réutilisé FK12 ADR0007 no-fork) + repro mirror (déterminisme byte-identique). Le seul LLM (why hors-graphe) gated, entre pré-vérifié, code juge structure via verdict. PAS de determinism gap.

DOCS Mintlify: .aidos-docs/steps/concept/wb2-19-why.mdx + steps/internals/wb2-19-why.mdx (3 layers Implémentation·Méta·Méta-méta) docs.json:527-528 mint validate PASS, docs HEAD 80a2c44==origin/main pushed. Code HEAD 3a6b85d==origin/build/s00-s47 (executor 46c7db9 + verifier biome fix 3a6b85d).

OQ by-design: Linear-unauth (issue WB2-19 ni créée ni Done — linear-server OAuth requis) ; vrai-Claude-why-hors-graphe-non-branché (offGraph simulé dans WHY_CASES) ; docs/plan/WB2-19.md absent (WB2-* pas matérialisés en fichiers, spec reconstruite depuis ROADMAP-fke FK13 lignes 93-97) ; prod:3000 inactif ici.

SCAR RÉSOLU: nouvel écran /v2/<x> orphelin (3× WB2-14/15/18) — CETTE FOIS executor a branché GrilleScreen v2-grille-gesture-why + clé gestureWhy SANS omission. TOUJOURS grep /v2/<x> hors dir → ici NON-vide (GrilleScreen.tsx:113). Pattern reste à vérifier.
SCAR CONFIRMÉ (2e fois après WB2-18): executor claim "Biome clean" alors que noNonNullAssertion WARNINGS subsistent (exit 0 donc non-bloquant mais claim faux). whyCaseById(...)! dans tests → toujours vérifier biome warnings même si exit 0. Fix = guard if(x===undefined)throw, PAS de ! ni as.

EXECUTOR REPORT ACCURATE (16/16+240/240+2/2 e2e réels, reachability branchée, docs/mint/push réels) SAUF biome-warnings-omis (claim "Biome clean" inexact, non-bloquant).
