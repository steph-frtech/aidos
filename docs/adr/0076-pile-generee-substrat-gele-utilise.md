# ADR 0076 — La pile GÉNÉRÉE embarque + UTILISE le substrat gelé COMPLET (exigence de première classe)

- **Statut :** accepté (décision humaine, 2026-06-15 : « GO » sur docs/plan/PLAN-branchements.md)
- **Date :** 2026-06-15
- **Contexte KRD :** CLAUDE.md §3 (la pile gelée — Doltgres datastore émis, OTel→Postgres, pgvector) · §6/§8 (determinism-first, émetteurs déterministes) · §9 (anti-overwrite) · ADR 0040 (app émise = Hono + 3 enfants) · ADR 0043 (IaC = Pulumi) · ADR 0006/0047/0048 (Doltgres hors-prod / Postgres prod) · ADR 0052 (pipeline de déploiement émis) · ADR 0065 (DP06 environment-set + Doltgres non-prod) · ADR 0068 (DP14 palette substrat 2026) · ADR 0072 (décision-mère : Workbench = Next + Go/Postgres, twins = aperçu/fallback gouverné, **généré = Hono**) · steps S43 (reality-ingest), S73/S74 (ops async émises), DP02/DP06/DP14 (stack manifest + palette)

## Contexte

La décision-mère **ADR 0072** tranche la couture : le Workbench est un front Next devant un moteur Go/Postgres, la vérité vit en Postgres, et seul l'**objet généré** est en Hono. Le présent ADR descend dans cet objet généré et acte ce qu'il embarque réellement.

L'utilisatrice a énoncé l'intention « tout ça par défaut dans les specs » : une app codée depuis ses specs doit naître avec **sa vraie full-stack**, pas une coquille qui *déclare* un substrat sans jamais s'en servir. L'audit `w91305w3q` (2026-06-15) a relevé que le substrat gelé est, aujourd'hui, partiellement **menteur** — présent en `env`/dépendance, jamais sur un chemin vivant. C'est un **monstre** au sens §1 (une capacité annoncée sans comportement prouvé), à la frontière de l'app émise :

- **OTel** — `back/runtime/honoemit/scaffold.go` (l. 44-63, 131-251) émet bien `instrumentation.ts` (NodeSDK + exporter OTLP/HTTP vers `http://opentelemetry-collector:4318`), et `pulumi_stack_hono.go` (l. 62-66) câble l'env `OTEL_EXPORTER_OTLP_ENDPOINT`. Mais le collecteur **n'a pas de puits persistant** : les spans partent sur le flux puis sont **perdus**. Sans un sink `telemetry.span` en Postgres, le `RealityMirror` et l'on-ramp `/learn` (S43) n'ont **rien à lire**.
- **NATS / Valkey** — `scaffold.go` (l. 66-71, 217-240) lit `NATS_URL` et l'URL Valkey, mais le boot se borne à `console.log` (« no forced redis/nats lib »). Le bus n'a **pas d'outbox** qui publie, le cache n'a **pas de GET** sur la lecture des entités. L'`env` est présent, le service **inutilisé**.
- **Windmill** — `grep -li windmill back/**.go` ne touche que `connectorinfra`/`asyncfragments`, **jamais le chemin de déploiement émis** : `pulumi_stack_hono.go` déploie 3 conteneurs (server / interpreter / datastore), **zéro conteneur Windmill**, alors qu'un écran l'affiche « provisionné ». Les ops async S73/S74 routent vers un worker local, jamais vers Windmill.
- **Doltgres** — `back/cmd/aidospulumi/materialise_hono.go` (l. 49-64) pose `Image: "postgres:16-alpine"` pour le rôle `datastore` **partout**, prod comme hors-prod. L'URL Doltgres affichée ailleurs est donc **fictive** (cf. ADR 0080). Or la pile gelée (CLAUDE.md §3, ADR 0006/0065) impose **Doltgres en non-prod** (le git-for-data, le point de restauration) et **Postgres en prod**.
- **Better-Auth** — `$.auth` est un header local jamais relié à un middleware de session ni à un `AUTH_URL`.

Chaque ligne ci-dessus est une preuve d'audit : le substrat est *câblé en intention* (deps + env) mais pas *utilisé en exécution*. Un substrat déclaré-non-utilisé est exactement le genre de divergence que le mur du concept refuse — un écran qui ment.

## Décision

**Toute app générée embarque le substrat gelé COMPLET — Hono + Doltgres(hors-prod)/Postgres(prod) + Windmill + OpenTelemetry→Postgres + NATS + Valkey + Better-Auth + docs + connecteurs — émis par défaut dans les specs du projet, et chaque service est soit RÉELLEMENT UTILISÉ sur un chemin vivant, soit explicitement DÉCLASSÉ (level-3) pour que l'écran cesse de mentir. C'est une exigence de première classe, pas une option.**

La règle de coupure est binaire et fail-closed : pour chaque service du substrat, **il existe une trace d'exécution prouvée par miroir** (l'app *s'en sert*), **ou** le service est déclaré level-3 (référence/non-déployé) et l'écran le dit. Pas de troisième état « présent mais muet ».

1. **OTel → Postgres (puits persistant).** Le collecteur partagé gagne un **exporteur persistant** vers `telemetry.span` : un sidecar OTLP→`pgx` qui fait un `INSERT` **append-only** (jamais un `UPDATE` — §9), en `debug`/stdout seulement en dev. C'est ce puits qui rend le `RealityMirror` et `/learn` (S43) opérants : la réalité prod redevient une on-ramp lisible vers le kernel, plus un flux perdu. Branche : `scaffold_otel_test.go` scelle déjà l'émission ; le sink est ajouté côté `.deploy-pulumi/otel/config.yaml` (exporter PG).

2. **Windmill (workflows).** Un conteneur Windmill est **déployé** (par stack ou partagé, selon `pulumi_stack_hono.go`) et l'app émise **route ses ops async** (S73/S74) vers lui, plus seulement le worker local. Sans conteneur déployé, l'écran le déclasse level-3 (cf. ADR 0080) — jamais « provisionné » menteur. Jamais Temporal (CLAUDE.md §3).

3. **NATS (bus) + Valkey (cache).** Le scaffold émet un **client réel** : NATS publie via une **outbox async** (l'op écrit en base puis publie l'événement) ; Valkey **cache la lecture** `GET /entities`. Le `console.log` actuel est remplacé par une utilisation effective ; un miroir prouve qu'un événement publié est consommé et qu'un cache-hit court-circuite la base.

4. **Doltgres hors-prod / Postgres prod (ADR 0006/0065).** Le rôle `datastore` de `materialise_hono.go` devient **`doltgresql` en non-prod** (git-for-data, point de restauration), **Postgres en prod**. Le wire Postgres étant identique, le sqlc/pgx/Atlas est **réutilisé tel quel** (§3 : « même dialecte Postgres, pas de MySQL ») ; un **spike** valide le wire Doltgres (régime spike→fallback Postgres, ADR 0047). Fin de l'URL fictive (ADR 0080).

5. **Better-Auth (session).** Un **middleware de session** Better-Auth est émis et relié à `AUTH_URL` ; `$.auth` n'est plus un header local mais une session vérifiée.

6. **docs (Fumadocs/Scalar) + connecteurs (MCP gateway).** Émis par défaut ; un connecteur déclaré sans gateway atteignable est déclassé level-3 (ADR 0080), jamais affiché « live » menteur.

L'émission reste **déterministe** (§6/§8) : chaque client/sidecar est rendu par un **émetteur pur** (mêmes specs → mêmes bytes), jamais une « génération LLM d'infra ». Chaque service utilisé porte sa **trace prouvée par miroir** ; un service au statut flou est un monstre qui bloque le step (au même titre qu'une capacité headless).

Branche (du plan) : `back/runtime/honoemit/scaffold.go` (clients émis + deps), `pulumi_stack_hono.go` (conteneurs Windmill/NATS/Valkey/auth, par stack ou partagés + env), `.deploy-pulumi/otel/config.yaml` (exporter PG), `materialise_hono.go` (image db Doltgres non-prod).

## Conséquences

- **Positif.** « L'app codée depuis ses specs **avec sa vraie full-stack** » devient vraie au sens fort : pas une démo, mais une app qui *utilise* son substrat. L'on-ramp prod→kernel (`RealityMirror`/`/learn`, S43) est débloqué par le puits OTel→Postgres : la vague de rouge peut désormais naître d'un signal réel et plus seulement d'un humain. Les écrans cessent de mentir (chaque service est utilisé OU déclassé, jamais « présent et muet ») — le monstre est tué à la frontière. Determinism-first respecté (émetteurs purs). Anti-overwrite respecté (le sink OTel est un `INSERT` append-only). Réaffirme la pile gelée §3 sur l'objet généré sans rien y substituer.
- **Coûts assumés.** (a) Le scaffold émis grossit (clients NATS/Valkey réels, middleware Better-Auth, sidecar OTel→PG) — chaque ajout porte sa **property test** d'idempotence (mêmes specs → mêmes bytes) et son miroir d'utilisation. (b) Doltgres non-prod est **beta** (ADR 0047) : régime spike→fallback Postgres si le wire échoue, jamais un blocage dur. (c) Windmill ajoute un conteneur au topology Pulumi — coût de déploiement assumé, ou déclassement level-3 honnête.
- **OpenQuestions (forward-deps, ne bloquent pas).** Persistance Postgres de la config OTel (aujourd'hui projetée vers `config.yaml`) ; le partage exact NATS/Valkey/Windmill (par stack vs instance-level partagé) à figer en DP ; le spike Doltgres-wire reste à confirmer vert (ADR 0047). Ces points sont des questions ouvertes documentées, jamais des `residual_issues` bloquants (CLAUDE.md §6, exception bootstrap).
- Le mur, le déterminisme et l'anti-overwrite restent **inchangés** ; cet ADR *augmente* l'app émise (elle naît full-stack et vivante) sans toucher la frontière de vérité de l'OS, qui reste en Postgres côté Workbench (ADR 0072).
