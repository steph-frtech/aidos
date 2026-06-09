# ADR 0051 — Le graphe de specs 3D : react-force-graph-3d (Workbench)

- **Statut :** accepté
- **Date :** 2026-06-09
- **Contexte KRD :** FKE-38 (l'écran AI Lab) · les deux axes (FKE-1.4) · `replaceable`

## Contexte

Quand un projet accumule **beaucoup de specs** (placements × sous-specs × facettes × niveaux), une table/liste ne passe plus à l'échelle pour **naviguer les liens**. Le modèle FKE est nativement à **trois axes** (verticale × facette × profondeur d'anatomie) : un **graphe 3D façon Obsidian** est la projection naturelle.

## Décision

Rendre le graphe avec **`react-force-graph-3d`** (wrapper React de `3d-force-graph` / **three.js**) dans le Workbench, en **client-only** (`next/dynamic`, `ssr:false`).

- **La donnée du graphe est PURE et déterministe** (`lib/ai-lab.buildSpecGraph`) : nœuds = specs placées + specs du DAG existant, **positionnés** par `(niveau × facette × profondeur)` ; liens = la descente d'anatomie (spec → sous-spec) + l'impact sur le DAG existant. Même entrée ⇒ même graphe (testé). **Le rendu 3D est la seule partie « lib »** — determinism-first §6/§8 respecté.
- **Positions FIXES** (`fx/fy/fz`) : la disposition EST la grille à 3 axes, **pas** une simulation de forces aléatoire → reproductible.
- **Le mur §2 :** le graphe LIT, n'écrit aucune vérité.

## Alternatives écartées

- **Projection isométrique SVG maison** (zéro dépendance) : déterministe et légère, mais **non rotatable** → pas l'expérience « comme Obsidian » demandée.
- **three.js brut** : plus de contrôle mais beaucoup de code de graphe à réécrire (forces, picking, labels) — `3d-force-graph` le fait déjà.

## Conséquences

- Dépendance lourde (`three`) chargée **uniquement** sur `/ai-lab` (dynamic import, hors SSR) — pas d'impact sur le reste du Workbench.
- `replaceable` : la donnée étant pure, on peut changer de moteur de rendu (ou retomber sur la projection SVG) sans toucher `buildSpecGraph`.
- 3 vulnérabilités modérées signalées par npm (transitif three.js) — viz only, à surveiller.
