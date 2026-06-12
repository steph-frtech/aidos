---
name: wb2-18-graphe
description: §WB2-18 /v2/graphe verification — 3D Obsidian-style spec graph; orphan-screen scar recurred 3rd time + new biome-ignore-placement scar
metadata:
  type: project
---

# §WB2-18 — /v2/graphe (graphe 3D façon Obsidian)

Verified after WB2-17. NEW SCREEN /v2/graphe = quand il y a BEAUCOUP de specs une liste ne tient pas, un GRAPHE 3D oui: chaque spec placée + chaque spec DAG existant = NŒUD sur 3 axes FKE (x=verticale niveau, y=facette, z=profondeur anatomie spec→evidence); liens = descente anatomie + impact DAG; couleurs portent l'état (proposé ambre/validé vert/réalisé bleu; DAG gris/impacté rouge/résolu vert). react-force-graph-3d (WebGL, client-only dynamic ssr:false).

**Done-criteria:** twin buildSpecGraph pur + property (positions déterministes) ; e2e — le graphe monte, tourne/zoome. BOTH MET.

**TWIN (lib/v2/ai-lab.ts, ADR0007 no fork):** ré-exporte buildSpecGraph+SpecGraph/Node/Link de v1(lib/ai-lab.ts:1184 — positions content-addr par lvl×fct×depth × GRAPH_AXIS=70, fields x/y/z/depth/kind/impacted/resolved/label) + 3 PURES: needGraph(sample,validated?)→place clampé×EXISTING_DAG×needImpacts clampés, si validated valide tout AVANT(vague rouge→vert)/graphTally→{specs,dag,impacted,resolved,links}/GRAPH_AXES bilingue. needGraph délègue DONNÉE à buildSpecGraph v1, NO LLM, résolution lit MÊME impactResolved que liste/grille/cellules (cohérent PARTOUT).

**MIROIR 7 WB2-18 (→224/224 total, +7):** déterminisme needGraph 2×(positions identiques fast-check)/3 axes finis+depth≥0/MÊME cellule→MÊME position/DAG existant présent(d:<id>)/VAGUE ROUGE au placement impacted resolved=false→VALIDER TOUT resolved=true=CRITÈRE/graphTally cohérent specs+dag==nodes resolved≤impacted validated→resolved==impacted/GRAPH_AXES bilingue. RÉEL re-run vitest 224/224.

**SCREEN:** page.tsx Server(29 KEYS)→GrapheClient client-only ForceGraph3D dynamic ssr:false, fx/fy/fz FIXÉS = layout déterministe(pas force aléatoire) enableNodeDrag=false cooldownTicks=0; boutons v2-graphe-sample-<id>/v2-graphe-validate-all(disabled validated||impacted==0)/v2-graphe-reset; data-all-green+tally data-specs/dag/impacted/resolved/links+v2-graphe-3d data-node-count; légende 3 axes+couleurs. ZÉRO fetch/POST(grep clean sauf wall-refusal text) mur tient.

**e2e VÉRIFIÉ LIVE PAR MOI:** next build OK(/v2/graphe ƒ, 124 pages)→next start -p 3418→PLAYWRIGHT_WEB_PORT=3418 PLAYWRIGHT_BASE_URL=http://localhost:3418 → 1 passed 2.4s (graphe monte canvas WebGL visible+data-node-count>0, tourne/zoome mouse drag+wheel sans planter, vague rouge data-all-green=false resolved=0→Valider tout→all-green=true resolved==impacted+disabled→Réinitialiser→rouge revient, writes[]). Kill exact pid ss:3418. prod:3000 PAS actif ici(curl 000).

**VERIFIED-GREEN AFTER 2 CORRECTIONS (verifier fa6b2ae):**
1. **REACHABILITY — /v2/graphe ÉCRAN ORPHELIN** (3e fois ce scar après WB2-14/WB2-15): grep /v2/graphe hors app/v2/graphe/ = VIDE, aucun lien entrant. GrilleScreen.tsx (le HUB) branchait operations/workflows/policy/ai-lab mais OMETTAIT graphe → AJOUTÉ Link href=/v2/graphe data-testid=v2-grille-gesture-graphe + clé bilingue gestureGraphe(fr"Le graphe 3D façon Obsidian"==en"The 3D graph, Obsidian-style"). Confirmé live curl:3418 /v2/grille sert v2-grille-gesture-graphe.
2. **BIOME-IGNORE MAL PLACÉ** (NOUVEAU SCAR): GrapheClient.tsx `// biome-ignore lint/suspicious/noExplicitAny` était ligne 13 AU-DESSUS de `const ForceGraph3D = dynamic(...)` mais le `as any` est ligne 16 APRÈS le multi-line dynamic() → biome warning "Suppression comment has no effect" + noExplicitAny FIRE. biome-ignore DOIT être sur la ligne IMMÉDIATEMENT avant l'expression flaggée → déplacé DANS l'objet dynamic juste avant `}) as any`. Après fix biome CLEAN.

Après fixes: vitest lib/v2+app/v2 224/224, tsc0, biome CLEAN(GrapheClient+GrilleScreen+messages), build13.2s /v2/graphe ƒ, i18n v2Graphe fr29==en29(all 29 KEYS) + v2Grille fr14==en14(+gestureGraphe). DETERMINISM-FIRST buildSpecGraph authoritative positions content-addr repro mirror. WALL clean(client useState/useMemo SEULEMENT, ZÉRO fetch/POST, e2e writes[]).

**DOCS:** 2 pages .aidos-docs/steps/concept/wb2-18-graphe.mdx + steps/internals/wb2-18-graphe.mdx(3 layers Implémentation·Méta·Méta-méta), docs.json:525-526, mint validate PASS, d3f64dd==origin/main(0 ahead). Code fa6b2ae==origin(0 ahead, executor 8f348c2 + verifier reachability/biome fix pushed).

**DÉPENDANCE:** react-force-graph-3d@^1.29.1+three@^0.184.0 dans package.json (M, untracked-as-prior), HOISTÉS au root /data/dev/aidos/node_modules (npm workspaces) — require.resolve OK depuis front/web. ls node_modules/ LOCAL vide mais résolution monorepo OK — TOUJOURS vérifier require.resolve PAS ls local dans ce monorepo.

**OQ by-design:** Linear-unauth(executor n'a pu passer WB2-18 In Progress→Done, OAuth+restart requis)/vrai-Claude-cerveau-gauche-impacts-non-branché(NEED_SAMPLES déclarés synthétiques)/WB2-18.md-absent(ROADMAP-fke.md)/Mintlify-index-lag(pages poussées, propagation déploiement)/untracked-v2-prior-screens-libs(app/v2/* lib/v2/* jamais commités sur cette branche, by-design fonctionnel build OK).

**SCAR-CONFIRMÉ 3e fois (orphan-screen NON-additif):** quand l'étape crée un NOUVEL écran /v2/<x> (PAS additif à un écran existant comme WB2-16/17 l'étaient pour /v2/ai-lab), il est TOUJOURS orphelin tant qu'absent du hub GrilleScreen → grep /v2/<x> hors app/v2/<x>/ DOIT être NON-vide, sinon AJOUTER Link v2-grille-gesture-<x>+clé gestureX bilingue. Executor OMET SYSTÉMATIQUEMENT pour un nouvel écran (WB2-14/15/18). NB: WB2-16/17 étaient additifs à /v2/ai-lab→reachability déjà acquise→PAS de scar. Distinction: nouvel écran=scar, écran additif=pas de scar.

**SCAR NOUVEAU (biome-ignore placement):** un `// biome-ignore` doit être sur la ligne IMMÉDIATEMENT précédant l'expression flaggée. Si l'expression flaggée (`as any`) suit un appel multi-ligne (`dynamic(()=>...,{...}) as any`), le commentaire au-dessus de l'appel NE COUVRE PAS le `as any` → warning "no effect" + la règle fire. Placer le commentaire DANS le dernier objet juste avant `}) as any`.

**executor report ACCURATE COMPLET** (224/224+7/7+e2e réels ZÉRO false-green, dépendance/docs OK) SAUF 2 gaps omis: reachability(scar récurrent nouvel écran) + biome-ignore mal placé(warnings pas error donc executor a pu rater). Core technique solide.
