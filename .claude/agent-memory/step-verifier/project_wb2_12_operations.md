---
name: wb2-12-operations
description: WB2-12 /v2/operations replay of S10 Operation DSL fixtures as XState machine + React Flow state graph; verified green
metadata:
  type: project
---

§WB2-12 (after WB2-11) /v2/operations = REJOUER une fixture Operation DSL (S10 forme N2 état→commande→events, KRD §24.3 §93) comme MACHINE XState + GRAPHE D'ÉTATS React Flow.

TWIN lib/v2/operations.ts PURE/TOTAL/DETERM no-LLM REUSES S10 lib/operation.ts (run/CREATE_ORDER/HAPPY_STATE/HAPPY_CART, no fork ADR0007): frames(fixture)→suite ORDONNÉE ReplayFrame{index(-1=idle),command,kind(idle|step|done|denied),events CUMULÉS monotones,done}; chaque mutate consomme le prochain event émis par run; authorize DENY court-circuite→denied=dernière frame, AUCUN event. stateGraph(fixture)→nodes(id=s<index> content-addr)+edges(e<i>-<j>) |nodes|=|frames| |edges|=|frames|-1. verdict(fixture) CALCULÉ events==expectedEvents dans l'ordre. Fixtures CREATE_ORDER_HAPPY([OrderCreated,CartCleared]) + CREATE_ORDER_DENIED([] §93). Registre CLOS FIXTURES + routage slug↔id BIJECTIF («/»→«--» car / casse segment route) fixtureBySlug undefined→404.

MACHINE app/v2/operations/OperationReplayMachine.ts XState v5 2 états idle/finished, CURSEUR dans allFrames (twin), AVANCER(+1 borné)/REJOUER_TOUT(saut dernière)/RECOMMENCER(0); DELEGATES tout au twin, NE JUGE RIEN; context INJECTÉ par input (fixture choisie par route)=totalité. CLIENT OperationReplayClient.tsx useMachine+ReactFlow nodesDraggable/Connectable/elementsSelectable=false(wall@UI) nœud courant surligné tokens ADR0010.

SCREEN page Server→client; /v2/operations index (registre clos) + /v2/operations/[op] dynamique notFound() slug inconnu. REACHABLE via GrilleScreen.tsx lien v2-grille-gesture-operations href=/v2/operations clé v2Grille.gestureOperations — GrilleScreen rendu par /v2/verticale ET /v2/grille (operation level vit dans verticale). 'operations' PAS slug glossary→own route no /v2/[slug] collision.

VERIFIED-GREEN ZERO corrections: vitest twin14+machine6=20/20, lib/v2+app/v2 153/153(133 prior+20), tsc0, biome0(7 files clean), next build 18.9s /v2/operations ƒ +/v2/operations/[op] ƒ 116/116 static. i18n v2Operations fr19==en19 keys match + v2Grille.gestureOperations fr/en present. WALL clean(client envoie SEULEMENT send({type:}) XState events, ZERO fetch/POST/PUT/PATCH/DELETE; mutate via mock seam sous waterline; e2e writes===[]). docs 3-layer (Implémentation·Méta·Méta-méta) docs.json:513-514 mint validate PASS. code HEAD 381bea6==origin/build/s00-s47 in-sync; docs commit 6b40e42 pushed steph-frtech/docs main.

e2e tests/e2e/v2-operations.spec.ts 2/2 (executor ran prod build :3377): happy pas-à-pas events apparaissent dans l'ordre→PASS+RECOMMENCER→idle+writes[]===[]; denied REJOUER_TOUT→finished SANS event+denied. Testids all exist in source (v2-op-title/machine-state/event-0/1/step/replay-all/restart/no-events/current-step/graph/fixture-id/verdict). DETERMINISM-FIRST: frames/stateGraph/verdict pure no-LLM + reproducibility mirror (idempotence property fast-check + determinism tests).

OQ by-design: Linear MCP unauth (WB2-12 not moved Done by executor); Mintlify index lag (pages pushed+validated, search index not yet); fixture du registre déclaré (CREATE_ORDER_HAPPY/DENIED §93) tant que SELECT kernel.operation live pas câblé — hérité S10. executor report ACCURATE (real 20/20 vitest, no false-green this time).
