# ADR 0053 — V2 Workbench : librairies d'interaction par usage (arbres / wizards / workflows / graphe)

- **Statut :** accepté
- **Date :** 2026-06-10
- **Contexte KRD :** Workbench V2 (refonte cohérente par concept, nouvelles URLs `/v2`) · ADR 0010 (Tailwind v4 + shadcn) · ADR 0011 (next-intl) · `replaceable`

## Contexte

La V2 du Workbench refait **tous** les écrans, structurés par concept KRD avec le **bon vocabulaire** (idée · mur · kernel · verticale · facette · paires-miroir · liens §17 · cellules · arbres). Beaucoup d'écrans sont des **arbres**, des **wizards** ou des **workflows** — il faut la meilleure librairie **par usage**, pas une seule pour tout.

## Décision — la bonne lib pour le bon usage

| Usage KRD | Lib choisie | Pourquoi (vs l'alternative) |
|---|---|---|
| **Arbre de DONNÉES dense** (arbre de composition `composes`, Version DAG, WhyTree, Policy DSL, navigateur de cellules/specs) | **React Arborist** | virtualisé (gère « plein de specs »), drag-drop, contrôlé. L'alternative React Aria Tree est headless/a11y-first mais non virtualisée → réservée aux **petits** arbres. |
| **Arbre a11y headless / petit** (nav, sélecteurs) | **react-aria-components `Tree`** | WAI-ARIA complet, se compose avec les tokens shadcn. Là où l'accessibilité prime et la taille est petite. |
| **Wizard / geste EXÉCUTABLE** (grill, /goal, idée-intake, red→green) | **XState v5 + React Hook Form + Zod** + **stepper shadcn** | les gestes KRD SONT des machines à états → XState modélise l'état, RHF l'état de formulaire, Zod la validation. **MUI Stepper écarté** : MUI entre en conflit avec le thème Tailwind+shadcn (ADR 0010) → stepper **shadcn** maison. |
| **Workflow / scénario VISUEL** (éditer/afficher le graphe : pipeline FKE-3, flux verticale, graphe de kernels) | **React Flow (`@xyflow/react`)** | l'éditeur node-graph de référence (nœuds/arêtes, pan/zoom, custom nodes). |
| **Workflow EXÉCUTABLE** (fixtures Operation DSL `état→commande→events`) | **XState v5** | une fixture S10 EST une machine à états → XState l'exécute ; visualisée via React Flow (rendu) ou Stately. |
| **BPMN** (si export/notation BPMN explicite requis) | **bpmn-js** | **différé** (OpenQuestion) : seulement si un vrai besoin BPMN apparaît ; sinon React Flow + XState couvrent. |
| **Graphe 3D** (vue d'ensemble des specs sur les 3 axes) | **react-force-graph-3d** | déjà acté (ADR 0051). |

**Déterminisme-first (§6/§8) :** ces libs sont des **rendus** ; la DONNÉE (arbres, machines, graphes) reste des **projections pures** des vérités KRD (fonctions testées dans `front/web/lib/`). XState exécute des fixtures **déclarées**, jamais un jugement appris.

## Conséquences

- Dépendances V2 (client, chargées par route) : `react-arborist`, `react-aria-components`, `xstate` + `@xstate/react`, `react-hook-form`, `zod`, `@xyflow/react`, (`bpmn-js` différé), `react-force-graph-3d` (déjà là).
- **Pas de MUI** — cohérence du thème shadcn (ADR 0010) préservée.
- `replaceable` : la donnée étant pure, on change un rendu sans toucher les twins `lib/`.
- Chaque écran V2 déclare, dans sa page « Pour moi », **quelle lib pour quel usage** (traçabilité).
