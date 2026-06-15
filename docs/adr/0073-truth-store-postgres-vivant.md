# ADR 0073 — Le truth-store Postgres devient la vérité LIVE (S17/S31) ; le transcript v3 devient une projection

- **Statut :** accepté (décision humaine, 2026-06-15 : « GO » sur docs/plan/PLAN-branchements.md)
- **Date :** 2026-06-15
- **Contexte KRD :** CLAUDE.md §1 (Mandat B — kernel · mirrors · ideas · changesets · dag · brain · context = schémas Postgres) · §2 (le mur — seul le Go écrit la vérité) · §4 (`back/archive/*` store/changeset/dag · `back/kernel/*` ideas/operation) · §6 (bootstrap exception — forward-deps S17/S31) · §9 (anti-overwrite) · ADR 0072 (décision-mère : la vérité vit en Postgres au runtime, le front appelle le moteur) · steps S02 (content-address) · S17/S31 (projection kernel) · S20 (changeset) · S24 (DAG) · audit `w91305w3q`

## Contexte

ADR 0072 a tranché : la vérité du Workbench vit en Postgres **au runtime**, écrite par le Go, appelée par le front. Reste à graver la conséquence directe sur l'état des **projets v3**.

Aujourd'hui, l'état d'un projet (ses ideas, ses changesets, son fil de DAG, son kernel projeté) est sérialisé dans des **transcripts fichiers** sous `.aidos-projects`, lus et écrits par `front/web/app/v3/projects-actions.ts`. C'est un héritage de l'**exception bootstrap** (CLAUDE.md §6) : tant que la projection kernel des steps S17/S31 n'était pas branchée au chemin Workbench, l'état devait se matérialiser ailleurs. Cette tolérance est devenue une **source de vérité de fait** — exactement ce que Mandat B interdit (CLAUDE.md §1 : « la source de vérité est Postgres ; le disque est dérivé »). Un transcript fichier traité comme source est un **monstre** : une vérité hors de sa place, hors du mur, qu'aucun moteur Go ne garde.

Les briques Go existent et sont vertes : `back/archive/*` (content store S02, changesets S20, dag S24), `back/kernel/*` (ideas, projection d'opérations S17/S31). Elles ne sont simplement pas reliées au chemin du Workbench.

## Décision

**Les schémas Postgres `kernel · mirrors · ideas · changesets · dag · brain · context` deviennent la vérité LIVE des projets v3. Le transcript v3 (`.aidos-projects`) devient une *projection* de Postgres (matérialisée à la demande), plus jamais la source. La forward-dependency bootstrap des steps S17/S31 (projection kernel au chemin Workbench) est ainsi LEVÉE.**

1. **Postgres est la source, le fichier est dérivé.** L'état d'un projet (ideas, changesets, fil de DAG, kernel/operations projetées) est **persisté et lu dans Postgres** via le moteur Go. Le content-addressing (S02) et l'append-only restent la règle : rien n'est détruit, le head est mutable. Le transcript `.aidos-projects` reste **matérialisable** (pour l'inspection, le debug, un runner hors-ligne) mais comme **projection régénérable** — le disque est dérivé, la base est autoritative (Mandat B, mot pour mot).

2. **Le front lit/écrit via le moteur, plus les fichiers.** `front/web/app/v3/projects-actions.ts` cesse d'être la porte de persistance : il **appelle le moteur Go** (via la gateway/MCP, ADR 0074) qui, lui, écrit la vérité en Postgres **à travers le mur** (§2). Le front n'écrit jamais Postgres directement ni un fichier-source ; il déclenche des gestes Go qui le font.

3. **Le chemin de vérité est branché.** `back/archive/*` (store/changeset/dag) et `back/kernel/*` (ideas / projection d'opérations) sont reliés au chemin Workbench : ce sont eux qui matérialisent l'état du projet en Postgres. La projection d'opérations S17/S31, jusqu'ici mockée pour le Workbench (exception bootstrap), est désormais **le chemin réel** — la forward-dependency est levée et n'est plus une OpenQuestion.

4. **Append-only et anti-overwrite (§9).** Une transition d'état d'un projet est un **changeset** (S20), pas une réécriture de fichier. Reprendre un projet = rejouer/projeter depuis Postgres, pas relire un blob. Un override n'est pas une édition : c'est une décision enregistrée (changeset + provenance).

## Conséquences

- **Positif.** Mandat B devient littéral pour les projets v3 : la vérité vit en Postgres, le Go l'écrit, le front l'appelle. Le monstre « transcript fichier traité comme source » disparaît. L'historique d'un projet devient un vrai fil de DAG/changesets append-only (S20/S24), reprenable et auditable, plutôt qu'un blob écrasable. La forward-dependency S17/S31 — listée en exception bootstrap depuis l'origine — est **levée** : elle quitte le statut d'OpenQuestion.
- **Coûts assumés.** (a) Migration des projets existants des transcripts `.aidos-projects` vers la projection Postgres (one-shot, append-only — on n'écrase pas, on importe comme phases/changesets). (b) `projects-actions.ts` perd son chemin fichier direct : il dépend du moteur joignable (le fallback gouverné + l'e2e anti-fallback-silencieux d'ADR 0074 couvrent l'injoignabilité). (c) Le transcript fichier reste produit comme **projection** (utile au debug) — il faut garantir qu'il ne redevienne pas une porte d'écriture (un test : écrire le fichier à la main ne change rien à l'état que le moteur relit depuis Postgres).
- **OpenQuestions (forward-deps, ne bloquent pas).** Le détail du schéma de projection (quelles colonnes JSONB, quel découpage par projet — RLS multi-projet) suit la migration Atlas réelle ; la frontière exacte « projeté vivant en Postgres » vs « rematérialisé à la demande sur disque » sera affinée au branchement effectif.
- Le mur et l'anti-overwrite sont **inchangés** ; cet ADR ne fait qu'appliquer ADR 0072 à l'état des projets — la vérité quitte les fichiers pour Postgres, le fichier redevient ce qu'il doit être : une projection.
