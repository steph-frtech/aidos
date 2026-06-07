# S53 — Entité racine `project` + ProjectScope

> EPIC 1 (Fondation multi-tenant) de la feuille de route app-builder. Voir
> `docs/plan/ROADMAP-app-builder.md` (ligne S53) pour le contexte d'épic.

## Objectif (une capacité vérifiable)

Introduire le **`project`** — le concept Kernel de **premier rang** qui scope toute
vérité. Jusqu'ici AIDOS est UN graphe global indivis (zéro colonne `project_id`).
Un projet est le scope racine sous lequel l'app d'un utilisateur se construit : deux
utilisateurs (ou deux apps) ne se télescopent jamais dans le truth-store singleton.

## Forme du record

Un `project` content-adressé porte : `slug` (handle stable, **unique par owner**),
`name`, `owner_ref`, `created_at` (passé en entrée, pas d'horloge), `lifecycle`
(`active|archived|deleted` — soft-delete append-only ; la suppression dure GDPR est
S116). `id == version == records.Hash(records.Canonicalize(body))` (réutilise S01/S02,
jamais un hash forké).

## Critères de done (calculés, non déclarés)

1. **Property (miroir de repro)** — `id` content-adressé et idempotent ; `slug`
   unique par owner (refus du doublon owner+slug, autorisé sous un autre owner) ;
   **deux graphes-projets disjoints** : `Scope(A, rows)` et `Scope(B, rows)` ne
   partagent aucun élément et ne renvoient que les lignes de leur projet ; scoping
   = **fonction pure** (même entrée → même sortie) ; lifecycle clos à trois.
2. **Schéma Postgres `projects`** — `projects.project` (content-adressé, append-only)
   + index unique `(owner_ref, slug)` sur les têtes non-deleted ; `projects.dag_root`
   (nœud racine DAG par projet, FK). GRANTs below-the-line (INSERT/SELECT/UPDATE ;
   pas de DELETE — soft-delete). Le mur sur kernel/mirrors/fitness inchangé.
3. **Nœud racine DAG par projet** — `RootNode(project)` réutilise `dag.NodeID`
   (S24) ; deux projets → deux racines disjointes.
4. **Le mur** — `/projects` écrit le record *below the line* via le chemin store
   (comme `/store`) ; aucune écriture de vérité depuis l'écran.
5. **Déterminisme** — content-addressing, validation de slug, gate d'unicité,
   transition de cycle de vie, scoping : toutes des fonctions pures (code, jamais un
   LLM). Twin TS byte-identique au Go (vérifié).
6. **UI action-capable** — route Workbench `/projects` (thémée ADR 0010, bilingue
   ADR 0011) avec create / archive / restore / delete (soft) exécutables ; e2e
   Playwright prouvant que chaque control s'exécute.

## Artefacts

- `back/kernel/project/` — package pur (project.go, registry.go, dag.go) + miroirs
  (property, dag fixture, migration roundtrip Testcontainers).
- `back/migrations/projects_baseline.sql` — schéma `projects` + DAG root + GRANTs.
- `back/mcp/project/` — serveur MCP `project` (ADR 0009 : chaque op = un outil).
- `front/web/lib/project.ts` (+ `.test.ts`) — twin déterministe TS.
- `front/web/app/projects/` — route + Server Actions + panel.
- `tests/e2e/projects.spec.ts` — e2e Playwright.
- Docs Mintlify : `steps/concept/s53-projects.mdx` + `steps/internals/s53-projects.mdx`.

## OpenQuestions (forward-deps, ne bloquent pas)

- La porte canonique d'écriture projet est le MCP `project` ; le Workbench écrit le
  schéma directement via Server Action — réconciliation par la passerelle HTTP (S58).
- `project_id` sur kernel·mirrors·ideas·changesets·dag·brain·context = **S54**
  (cette étape n'ajoute la colonne nulle part ailleurs ; elle pose le scope racine).
- RLS keyée identité + mur project-aware = **S55** ; owner réel (user) = **S62**.
