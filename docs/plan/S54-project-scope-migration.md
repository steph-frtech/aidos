# S54 — Project-scope migration du truth-store (Archive, EPIC 1)

## Objectif (une capacité vérifiable)

Faire passer le truth-store d'AIDOS d'un graphe singleton indivis à un truth-store
**multi-tenant** : une migration Atlas **expand-contract** ajoute un `project_id`
(FK vers `projects.project`, S53) à **chaque** table de vérité et dérivée —
`kernel·mirrors·ideas·changesets·dag·brain·context` — et **backfille** le graphe
préexistant (la démo Order) dans un projet seed `__system__` content-adressé,
**sans aucune perte** (append-only).

## Inputs

- **S53** — l'enregistrement `project` + le schéma `projects` (FK target) + `records.Hash`.
- **S02** — les tables de records canoniques (`kernel.truth/layer/link`, `mirrors.mirror`, `ideas.idea`, `changesets.changeset`, `dag.phase`).
- **S31** — `brain.memory_item` ; **S15** — `context.context_graph_decision`.

## Critères de done (calculés, non déclarés)

1. **Zéro perte (append-only)** — compte de lignes avant == après ; aucun corps réécrit, aucune ligne effacée (Testcontainers `TestZeroLossBackfill`).
2. **Toutes les FK résolvent** — un insert au seed passe, un insert à un projet inexistant est refusé (`TestAllFKsResolve`).
3. **Isolation A↛B** — une requête scopée projet A (`ScopedSelect` → `WHERE project_id = $1`) ne renvoie jamais une ligne du projet B (`TestCrossProjectIsolation`).
4. **Émission de migration reproductible** — `EmitMigration()` : mêmes entrées → octets identiques (property `TestEmitMigrationReproducible`).
5. **Seed content-adressé pinné Go↔SQL** — le littéral du fichier == `SystemSeed().ID` (`TestSeedPinnedInMigrationSQL`).
6. **Le mur inchangé** — `SELECT`-only ré-asserté sur `kernel`/`mirrors` (`TestWallUnchanged`).
7. **Route Workbench `/project-scope` action-capable** + e2e Playwright (5/5).

## Artefacts

- `back/migrations/project_scope_baseline.sql` — la migration expand-contract.
- `back/archive/projectscope/projectscope.go` — paquet pur (seed, `ScopedTables`, `ScopedSelect`, `EmitMigration`).
- `back/archive/projectscope/project_scope_property_test.go` — miroir property (rapid).
- `back/archive/projectscope/migration_roundtrip_test.go` — miroir persistance (Testcontainers).
- `back/mcp/projectscope/main.go` — MCP (ADR 0009) : `scope_tables/scope_select_sql/scope_seed/scope_migration_sql`.
- `front/web/lib/projectScope.ts` + `.test.ts` — jumeau TS + miroir Vitest/fast-check.
- `front/web/app/project-scope/{page,actions,ProjectScopePanel}.tsx` — route action-capable.
- `tests/e2e/project-scope.spec.ts` — e2e Playwright.
- `.aidos-docs/steps/{concept,internals}/s54-project-scope.mdx` — docs Mintlify.

## Forward dependencies (OpenQuestions, non bloquantes)

- La **RLS keyée sur l'identité propagée** (seconde couche du mur) est **S55** ; S54 pose la colonne + FK qu'elle keyera.
- Le **chemin live gateway** (HTTP→MCP) est **S58** ; jusque-là la route `/project-scope` calcule la projection déterministe (`source: "demo"`, valeurs autoritaires, pas un stub).
- La **suppression dure GDPR** est **S116** (S54 ne fait que du soft, append-only).
