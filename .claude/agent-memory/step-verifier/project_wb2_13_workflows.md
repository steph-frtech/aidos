---
name: wb2-13-workflows
description: WB2-13 /v2/workflows projects an Operation DSL fixture as an FKE-3 pipeline (étape/gate/décision) in React Flow with proposed node-move (never written); verified green
metadata:
  type: project
---

§WB2-13 (after WB2-12) /v2/workflows = projeter une fixture Operation DSL en PIPELINE FKE-3 BRANCHÉ (start→steps→gate→decision→allow/deny→end) en React Flow, nœuds custom étape/gate/décision/borne, pan/zoom, DÉPLACEMENT de nœud = édition PROPOSÉE jamais écrite (le mur §2).

TWIN lib/v2/workflows.ts PURE/TOTAL/DETERM no-LLM RÉUTILISE frames/verdict de WB2-12 (donc l'interpréteur S10, no fork ADR0007). workflowGraph(fixture)→WorkflowGraph{fixtureId,nodes,edges}: filtre frames index≥0; chaque verbe→step; authorize→gate SUIVI d'une decision qui branche allow/deny; branche deny TOUJOURS dessinée→end{outcome:denied} (court-circuit §93); allow→suite→end{success}. ids content-adressés "w<counter>" (w0=start). moveNode(graph,id,pos) IMMUABLE renvoie nouveau graphe, original intact, id inconnu→inchangé. nodeKindCounts(graph)→Record<kind,number>. WORKFLOWS=FIXTURES (registre clos réutilisé), workflowSlug «/»→«--», workflowBySlug undefined→404, workflowSlugs.

MIROIR lib/v2/workflows.test.ts (Vitest+fast-check) 13/13 GREEN: déterminisme(workflowGraph deux fois ===), exactement 1 start+≥1 end, gate=1/decision=1 happy + sortie decision a branches sorted ["allow","deny"], deny→end{denied} pour TOUS, arêtes référencent nœuds existants, ids uniques /^w\d+$/, happy=5 steps+end{success}, moveNode immuable+id-inconnu+PROPERTY(déplacer ne change QUE position le reste byte-identique), bijection slug.

SCREEN page.tsx index (liste WORKFLOWS, verdict pass/fail badge) + [wf]/page.tsx Server→WorkflowClient, notFound() slug inconnu, generateStaticParams. CLIENT WorkflowClient.tsx "use client" React Flow uncontrolled defaultNodes/defaultEdges + ReactFlowProvider/useReactFlow pour déplacement impératif; override id→position découplé du store; nodesDraggable + nodesConnectable=false (wall@UI); indicateur data-moved calculé via moveNode pur; nœuds stylés tokens ADR0010 (var(--primary)/--card/--border/--destructive, color-mix oklab, ZÉRO hex). Bouton proposeMove déterministe x=160 + reset (vide override + remonte flowKey). Tokens ADR0010, bilingue v2Workflows.

REACHABLE: GrilleScreen.tsx (rendu par /v2/verticale ET /v2/grille) porte un lien href="/v2/workflows" testid v2-grille-gesture-workflows clé i18n v2Grille.gestureWorkflows. NOTE: l'executor a SOUS-RAPPORTÉ ceci comme OQ « pas de lien-geste, amélioration ultérieure » — FAUX, le lien EXISTE et est câblé. ui-completeness satisfaite (réutilise le pattern v2-grille-gesture-operations de WB2-12). 'workflows' PAS slug glossary→own route no /v2/[slug] collision.

VERIFIED-GREEN ZERO corrections: vitest twin 13/13, lib/v2+app/v2 166/166 (153 prior WB2-12 + 13), next build 13.6s /v2/workflows ƒ + /v2/workflows/[wf] ƒ, biome 5 files clean. i18n v2Workflows fr26==en26 (toutes clés des pages présentes) + v2Grille.gestureWorkflows fr/en. WALL clean (grep fetch/POST/PUT/PATCH/DELETE/kernel/mirrors/fitness vide hors commentaires; client SEULEMENT setNodes/setProposed local; e2e writes===[]). DETERMINISM-FIRST: workflowGraph/moveNode pures no-LLM + reproducibility mirror (déterminisme + property). code HEAD 9bd1079==origin/build/s00-s47. docs HEAD e3a6463==origin/main pushed (steps/concept + steps/internals wb2-13-workflows.mdx présents via git ls-tree origin/main; internals 3 layers Implémentation·Méta·Méta-méta confirmés), docs.json:515-516.

e2e tests/e2e/v2-workflows.spec.ts 2/2 (executor prod build :3378): happy pipeline s'affiche(gate=1,decision=1,steps=5)+drag souris w0→data-moved true+bouton x=160+reset→data-moved false+writes[]===[]; denied pipeline branché gate=1/decision=1. Tous testids présents en source (v2-wf-screen-title/wall-note/fixture-id/graph/count-gate/count-decision/count-step/proposed-pos/propose-move/reset-move). NON re-run par moi (scar: ne JAMAIS lancer Playwright/pkill next, prod long-lived :3000) — vérifié par lecture source.

OQ by-design: Linear MCP unauth (issue WB2-13 non déplacée Done); Mintlify index lag (pages poussées+validées, index public asynchrone); fixtures héritées du registre déclaré S10/WB2-12. executor report ACCURATE (166/166 réel, 13/13 réel, no false-green) SAUF la note reachability trop conservatrice (le lien existe).
