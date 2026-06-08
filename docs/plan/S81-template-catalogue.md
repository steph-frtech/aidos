# S81 — Catalogue de templates / starters instanciables (EPIC 7)

> **Sous-système :** Archive. **Dépend de :** S76 (behavior `Expand`), S80 (`app-auth`), S56 (`duplicate-from-template`), S71 (relations).

## Objectif (une capacité vérifiable)

Des **templates curatés** (e-commerce, CRM, booking) packagés comme **bundles content-adressés** — entités + relations + behaviors (dont `app-auth` de S80) + miroirs + operations + sources UI. Surfacés au `duplicate-from-template` de S56 ; « fork this app » duplique un projet à une phase stable.

## Done-criterion (calculé, non déclaré)

**property** — instancier un template produit un **projet de départ déterministe et vert** :
- **Kernel vert** : chaque entité/relation/operation du bundle valide (set scalaire clos respecté, relations vers des cibles présentes — pas de `UNKNOWN_RELATION_TARGET`).
- **miroirs présents** : chaque entité/operation/behavior porte au moins un miroir (forme dérivée) — pas de **truth sans miroir** (monstre).
- **aucun monstre** : pas de miroir orphelin (chaque miroir réfère une vérité du bundle) ; complétude OK.
- **déterministe** : même `(templateID, targetSlug)` ⇒ `StarterProject` byte-identique (BundleID content-adressé, `records.Hash`).

## Disciplines KRD

- **Mirror-first** : `template_property_test.go` (rapid, byte-identité + vert + aucun monstre) + `template_fixture_test.go` (instancier e-commerce → projet de départ vert ; fork à une phase stable).
- **Le mur** : l'instanciation est **below-the-line** (duplication de bundle + racine DAG, comme S56). Le freeze des vérités du bundle reste `propose → ChangeSet → approbation`. `WroteKernel` toujours false dans l'instanciation pure.
- **Determinism-first** : packaging + instanciation = fonctions pures ; `app-auth` réutilise l'unique `ExpandAppAuth` de S80 (jamais ré-implémenté).

## Artefacts
- `back/kernel/templates/` (pure Go) : `Bundle`, `Curated()` (e-commerce/CRM/booking), `Instantiate`, `Validate`, `Completeness`, `Fork`.
- `back/mcp/templates/` (ADR 0009) : `templates_list`, `templates_get`, `templates_instantiate`, `templates_fork`.
- `front/web/lib/templates.ts` (twin byte-identique) + `templates.test.ts`.
- `front/web/app/templates/` (route Workbench, thémée + bilingue) + `tests/e2e/templates.spec.ts`.
- Mintlify : `steps/concept/s81-templates.mdx` + `steps/internals/s81-templates.mdx`.
