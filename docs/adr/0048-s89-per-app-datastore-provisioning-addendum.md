---
status: accepted
addends: 0006
step: S89
---

# S89 — Provisioning du datastore par app : plain-Postgres par DÉFAUT, Doltgres opt-in, isolation par projet

Cet ADR est l'**addendum** d'ADR 0006 (« Emitted apps run on Doltgres ») et le
**suite** d'ADR 0047 (S88, le spike go/no-go). Là où S88 a **tranché** le
défaut/opt-in par la mesure, S89 **provisionne** concrètement le datastore de
l'app émise sous cette contrainte — par une **fonction pure** (`runtime/provision.BuildPlan`),
jamais un agent.

## Décision

> **Le datastore de l'app émise est PROVISIONNÉ par un planner pur : plain-Postgres
> PAR DÉFAUT (+ un sidecar pgvector ssi l'app a besoin de recherche vectorielle),
> Doltgres OPT-IN par app — et seulement si la `Decision` S88 est *go* —, le MÊME
> émetteur Atlas pour le DDL, une ISOLATION par projet (base + namespace dérivés
> d'un hash du projet), une migration expand-contract HUMAN-GATED via
> `DataTruthScope`, et le tout émis comme resource Pulumi (DP15, ADR 0043).**

Le `Plan` est **content-adressé** : même `Spec` → même plan (id, DDL, base). Aucun
LLM n'entre : la résolution de cible est un test d'appartenance, l'isolation est un
hash, le DDL vient de l'émetteur existant, le human-gate est le garde §44.3 existant.

## Reformulation EPIC 9 (préambule roadmap)

« Même sqlc + pgx » ne tient plus pour l'arbre émis : le driver de l'app est un
**client TS Postgres**. Ce qui **survit** au pivot — et que S89 **réutilise sans
forker** — est le **même Atlas + le même dialecte Postgres** :

- le DDL est rendu par `gen/db.EmitMigration` (S35/S95), partagé entre l'OS et l'app ;
- le human-gate est `db.RequireMigration` (§44.3), partagé ;
- le datastore (plain-Postgres / Doltgres opt-in) et les migrations Atlas sont
  **inchangés** ; le miroir (DDL s'applique, CRUD round-trip, `as of`) est driver-neutre.

## Conséquences

- **Le défaut reste plain-Postgres par construction.** `BuildPlan` ne quitte
  plain-Postgres que sur un opt-in **explicite ET légal** (`Decision.OptInAllowed(doltgres)`).
  Une cible Doltgres sous une décision no-go/absente est **refusée** (`OUT_OF_SCOPE`),
  jamais rétrogradée en silence. La chaîne E10 reste viable même si S88 rebascule no-go.
- **pgvector est un sidecar plain-Postgres.** Une app à embeddings ajoute un sidecar
  `pgvector/pgvector:pg16` (Doltgres n'a pas pgvector — caveat ADR 0006 honoré, jamais fabriqué).
- **Isolation par projet, sans état.** `database = "app_<hash12(projet)>"`,
  `namespace = "proj_<hash12(projet)>"` — deux projets distincts ne collisionnent
  jamais ; le même projet est stable (le mur §2 / S55 / S82 ramené au datastore).
- **La migration destructive est human-gated.** Un changement à impact historique
  sans `DataTruthScope` déclaré est **bloqué** (`HISTORICAL_IMPACT_REQUIRES_MIGRATION`) —
  la porte refuse, ne contourne jamais.
- **Émis comme resource Pulumi (DP15).** `PulumiResource{Type:"aidos:datastore:<target>", …}`
  consommé au pré-deploy : DDL → Atlas → start. Slot `replaceable` (ADR 0003).
- **Le mur tient.** `BuildPlan` lit les entités (vérité Kernel) + la `Decision` S88 et
  **émet** une projection ; il n'écrit ni kernel, ni mirrors, ni fitness. Le `Plan` est un record.

## Open-questions résolues / restantes (ADR 0006)

- **#1 (défaut vs opt-in)** — résolue par ADR 0047 (S88) et **mise en œuvre** ici (S89).
- **#2 (vector data : pgvector sidecar vs Dolt-native VECTOR)** — résolue côté
  provisioning : **sidecar Postgres+pgvector** (sur plain-Postgres), jamais sur Doltgres.

## Miroirs

- `back/runtime/provision/provision_property_test.go` (rapid) : reproductibilité,
  défaut plain-postgres, la porte doltgres, l'isolation, le human-gate.
- `back/runtime/provision/provision_apply_test.go` (Testcontainers) : le DDL s'applique
  sur le défaut, CRUD round-trip, `as of` sur doltgres opt-in (après `DOLT_COMMIT`),
  isolation par projet contre deux conteneurs.
- `front/web/lib/provision.test.ts` (fast-check) + `tests/e2e/provision.spec.ts` (Playwright).
