---
status: accepted
---

# ADR 0040 — Stack de l'app ÉMISE : Hono + TypeScript fonctionnel (distinct du Go gouvernable d'AIDOS)

- Status: **Accepted** (OQ-0040-interpréteur tranchée → **callback vers un service-interpréteur Go**, Décision 7)
- Date: 2026-06-06
- Step: EL00 (Runtime — aucun package : une cible gravée, comme le mandat FN02/ADR 0036)
- KRD: §S34 (déterminisme d'émission : même source → mêmes octets), §S46 (slice checkout / composition-acceptance), CLAUDE.md §2 (le mur), §3 (stack figée : « Emitted-app datastore… reuses sqlc/pgx » ; « Shared source schema → emits Go + TS »), §6/§8 (determinism-first)
- Inputs: ADR 0003 (stack figée), ADR 0006 (datastore Doltgres/Postgres de l'app émise), ADR 0007 (réutiliser des libs matures dans l'archi DSL-as-AST), ADR 0009 (MCP partout + accrétion d'artefacts), ADR 0010 (design system, « emitted web apps inherit it »), ADR 0036/FN02 (mandat fonctionnel du code émis), émetteurs `back/runtime/generators/{generators.go,emit.go,api.go,webcomponent/}`

## Contexte

AIDOS sépare deux artefacts qu'on confondait jusqu'ici :

- **La constructrice** — AIDOS lui-même : `back/` (Go : Kernel/Runtime/Archive + l'interpréteur Operation-DSL `back/kernel/operation`), `front/web` (Workbench Next), truth-store Postgres. C'est un **OS gouvernable**, sous le mur, derrière les neuf `phases` du contrat de step.
- **La construite** — l'app que l'OS émet pour l'utilisateur (l'arbre `gen/`) : aujourd'hui un **backend Go** (`TargetGoSqlc` → structs sqlc `back/gen/<e>/<e>.go` ; `TargetAPI` → `http.HandlerFunc` Go qui délègue à `operation.Interpret`) + un **front Next/React** (`TargetTSTypes` ; composant `.tsx` S38) + datastore **Doltgres/Postgres** via **sqlc/pgx** (ADR 0006). Le pivot Hono n'existe pas en code : les seules mentions « Hono » (`docs/plan/S10-operation-dsl.md`) le déclarent **hors-scope / pas encore**.

Constat : l'app émise hérite **par défaut** de la stack de la constructrice (Go-back + Next-front + sqlc/pgx) parce que CLAUDE.md §3 conflate les deux plans (« Emitted-app datastore… reuses sqlc/pgx » ; « Shared source schema → emits Go + TS »). Pour l'app utilisateur, ce n'est ni voulu ni optimal : on veut une app **ultra-fonctionnelle, edge-friendly, à type-sharing front↔back de bout en bout**. **Hono** (router TS multi-runtime — Node/Bun/edge — avec client typé `hc`) + **TypeScript pur-fonctionnel** est la cible idéale, et elle **s'aligne déjà** sur le mandat FN02 (ADR 0036 : pureté, no-global, graphe d'appel acyclique) — qui n'attend plus que de viser TS au lieu de Go.

Ce qui **survit** au pivot (vérifié, pas supposé) : le **dialecte Postgres** et **Atlas** (ADR 0006 — le datastore et les migrations sont neutres au langage du serveur) ; tous les contrats **Pact/OpenAPI** (neutres, providers JS existants) ; tous les miroirs de **reproductibilité byte-identique** (un émetteur TS déterministe l'est autant qu'un émetteur Go) ; **Playwright** (framework-agnostic) ; le mur, le mirror-first, determinism-first.

La **seule décision structurelle forcée** (au-delà d'un changement de template) : l'interpréteur Operation-DSL est **Go** (`operation.Interpret`) et le handler Go émis le **réutilise** ; un handler Hono/TS ne peut pas appeler l'interpréteur Go in-process. Le pivot force donc, pour S90/S77, soit une **ré-émission/port TS** de l'interpréteur (cohérent avec ADR 0007 : réutiliser une lib mature côté TS pour l'éval Expr — CEL-JS / une éval typée), soit un **callback vers un service-interpréteur Go**. Cette ADR la **nomme comme OpenQuestion tranchable en FN03/S90**, sans la résoudre prématurément.

## Décisions

1. **L'app ÉMISE est Hono (front + back), pur TypeScript fonctionnel — la constructrice reste Go gouvernable.** AIDOS (`back/`, `front/web`, l'interpréteur, le truth-store) **n'est jamais réécrit en TS** ; il **n'émet jamais de Go** pour l'app utilisateur. La frontière **constructrice ≠ construite** est **la** décision portée par cette ADR, au même rang que la frontière `gen/`-only d'ADR 0036 (§3 de cet ADR).

2. **Re-pointer les cibles d'émission de CODE — pas le datastore.** Les cibles backend Go (`TargetGoSqlc` structs, `TargetAPI` `http.HandlerFunc`) deviennent des cibles **TS/Hono** (handlers + workers + client de données TS) ; `TargetTSTypes` reste (devient la cible de types partagée front↔back) ; **`TargetPgDDL` (DDL Postgres) reste inchangé** ; `sqlc` (SQL→Go) **sort de l'arbre émis** au profit d'un client Postgres TS (postgres.js / Drizzle / Kysely — slot `replaceable`, choisi par tool-search au step, ADR au step). **ADR 0006 est INCHANGÉ** : datastore = dialecte Postgres, Doltgres opt-in, Atlas expand-contract ; seul le **driver d'accès** passe de pgx à un client TS. Les caveats beta Doltgres (≈ 5,2×, pas de pgvector, parser thread-unsafe **sous pgx concurrent #2581**, locks #2600) sont **re-mesurés contre le driver TS** par le spike S88 (le mode d'échec #2581 est pgx-spécifique).

3. **Le mandat fonctionnel FN02/ADR 0036 s'applique au code Hono/TS émis.** Les trois invariants émis (`EMITTED_FUNCTION_PURE`, `EMITTED_NO_GLOBAL_MUTABLE`, `EMITTED_CALL_GRAPH_ACYCLIC`) sont **neutres au langage** et s'appliquent verbatim au TS : module-level `let`/binding mutable au lieu de `var` Go ; détection d'effets ; cycles d'import. Leur **enforcement** bascule de `go-arch-lint`/`depguard` (Go-only) vers **`dependency-cruiser`** (cycles) + un linter de pureté TS (**ESLint `eslint-plugin-functional` / `no-let` / `no-param-reassign`**), fail-closed, déterministe — jamais un LLM qui « juge si c'est fonctionnel ». L'index call-graph (FN05) parse **TS** (ts-morph / TS compiler API / madge), plus un walker AST Go.

4. **L'app émise reçoit SES PROPRES MCP + Skills (ADR 0009, additif).** Conformément à « tout op backend = un outil MCP, sans exception » sur **les deux plans**, l'app Hono/TS expose ses opérations comme outils MCP **propres à l'app émise** (distincts des MCP d'AIDOS), et porte ses Skills d'app. C'est une **accrétion** (§5/§6, méta-loop n'ajoute que des gardes), jamais un retrait.

5. **Le code émis reste une ÉMISSION DÉTERMINISTE, jamais hand-authored — et reste gouverné par le mur.** Même Kernel → bundle Hono/TS **byte-identique** (déterminisme S34, « compile » = `tsc`/type-check au lieu de `go build`). L'app émise passe toujours par `idée → miroir → /goal → approbation` ; le pivot **ne crée aucune** porte d'écriture-vérité côté TS. La promotion en vérité reste l'écriture du miroir via `/goal`.

6. **CLAUDE.md §3 et ADR 0003/0010 sont amendés par renvoi.** Les slots Go-back **`mandatory`** d'ADR 0003 (Operation-DSL-interprété-en-Go, `go test`, sqlc, pgx) restent `mandatory` **pour AIDOS la constructrice** ; ils **ne s'appliquent plus à l'app émise**, dont la cible est régie par cette ADR. La ligne « Shared source schema → emits Go + TS » se lit désormais : **une source → Go pour AIDOS, TS pour l'app émise** (DDL partagé). ADR 0010 « emitted web apps inherit [Next/Tailwind/shadcn] » : le **thème + i18n** (tokens, FR-default) restent hérités ; le **framework front** de l'app émise devient Hono (JSX/SSR ou client `hc`) — décision de S93. Tout élargissement/assouplissement est un **changement de VÉRITÉ** (idée → miroir → /goal), épinglé par un property test de parité (cette liste ≡ la config FN04/S84).

7. **L'Operation-DSL s'exécute via un CALLBACK vers un service-interpréteur Go (OQ-0040-interpréteur TRANCHÉE).** L'interpréteur `operation.Interpret` reste **en Go, gouvernable, non dupliqué** ; il est exposé comme un **service interne** (HTTP/gRPC — un outil MCP par ADR 0009) que les handlers **Hono/TS** de l'app émise appellent à l'exécution via un **client typé**. On **NE ré-émet PAS** l'interpréteur en TS : pas de duplication d'une logique gouvernée, **une seule source d'interprétation autoritaire**, déterminisme + parité de comportement préservés (même AST → même résultat, prouvé une fois en Go — determinism-first : une implémentation, pas deux). Le handler Hono **valide/route** (TS pur-fonctionnel — « functional core, imperative shell »), **délègue** l'exécution de l'op au service Go, **projette** le résultat. **Déploiement de l'app émise** = bundle **Hono/TS** (front + routing back) **+ un sidecar interpréteur Go** — la seule dépendance Go de l'app émise, **partagée, gouvernée, versionnée avec le Kernel**. Trade-off **accepté** : un composant Go dans le déploiement émis, justifié car l'interpréteur EST une vérité gouvernée qu'on ne duplique jamais. **Le code que l'utilisateur possède** (handlers/UI/entités) reste **pur TS fonctionnel** ; l'interpréteur est de l'**infra AIDOS**, pas du code utilisateur. (Option de ré-émission TS via une lib d'éval Expr — ADR 0007 — **rejetée** : duplication d'une vérité gouvernée + risque de dérive de parité.)

## Conséquences

- **EL00** écrit cette ADR (décision + provenance), pas de package — comme FN02. Sa preuve est le **property test de parité** cible-déclarée ≡ config enforce-cée (`gen/`).
- **FN03** étend les émetteurs pour **produire** du Hono/TS pur (handlers + workers + client) + DDL ; le miroir property de pureté rejoue l'émission N fois et compare les octets — sur TS. La portée pureté côté handlers (qui font de l'I/O DB) suit « functional core, imperative shell » (OQ-FN02-effets-IO).
- **FN04** bascule l'enforcement des trois règles vers `dependency-cruiser` + linter de pureté TS sur `gen/`, avec fault-injection (injecter un `let` mutable de module / un cycle d'import → rouge).
- **S87** émet une **app Hono bootable** (router + middleware + `/healthz` + handlers par operation, sync ET async), entrypoint Node/Bun/edge, « compile » = `tsc`.
- **S88** re-mesure les caveats Doltgres contre le **driver TS** (le #2581 pgx-spécifique change de forme) ; **S89** provisionne le même datastore (Postgres défaut / Doltgres opt-in) + Atlas, **client TS** au lieu de sqlc/pgx.
- **S90/S77** **réalisent la Décision 7** : le handler Hono appelle le **service-interpréteur Go** (client typé, un outil MCP) ; **aucun port TS** de l'Operation-DSL. Le miroir de S90 prouve que `handler Hono → service Go → résultat` est équivalent (parité) à l'exécution Go in-process, et que le service Go reste la seule source d'interprétation.
- **S93** tranche le **framework front** de l'app émise (Hono JSX/SSR vs client `hc` typé) ; thème ccup + i18n inchangés ; le type-sharing front↔back de Hono (`hc`) est un gain net.
- **S82** sandbox = toolchain Node/Bun + tsc/Vitest ; **S84** arch-fitness émis = `dependency-cruiser` exclusivement ; **S92** observabilité émise = **JS/TS OTel SDK** ; **S94/S96/S98** preview/deploy/rollback = bundle Node/Bun/edge (Atlas inchangé) ; **S114** webhooks async = worker TS ; **S117** limites honnêtes re-formulées contre le driver TS.
- **L'app émise gagne ses propres MCP + Skills** (ADR 0009). Le mur, le mirror-first, le déterminisme et les neuf `phases` du contrat de step restent **intacts** (garde ajoutée, jamais retirée).

## Options considérées

- **(A) Garder Go-back + Next-front pour l'app émise (statu quo).** Rejetée : ne livre pas l'app ultra-fonctionnelle edge-friendly à type-sharing voulue ; force l'utilisateur dans la stack de la constructrice ; FN02 reste sur Go alors que TS pur-fonctionnel est un fit plus naturel.
- **(B) Réécrire AIDOS lui-même en TS pour uniformiser.** Rejetée fermement : AIDOS est l'OS **gouvernable** (Kernel/Runtime/Archive/interpréteur), prouvé en Go, sous le mur ; le réécrire est un risque massif sans valeur pour l'utilisateur et romprait la frontière constructrice ≠ construite. **AIDOS reste Go.**
- **(C) Hono front+back + TS pur-fonctionnel pour l'app émise, AIDOS reste Go (RETENU).** Sépare proprement constructrice et construite ; réutilise le datastore/Atlas/Pact/Playwright (ADR 0006/0007) ; aligne FN02 sur TS ; coût concentré sur les **émetteurs de code** et l'OpenQuestion-interpréteur (S90/S77), tout le reste compose l'existant.
- **(D) Changer aussi le datastore (client+dialecte TS-natif type SQLite/Mongo).** Rejetée : casserait ADR 0006 (un seul dialecte Postgres, Doltgres git-for-data) et la réutilisation Atlas/DDL pour zéro gain ; le dialecte Postgres + un client TS suffit.

## OpenQuestions

- **OQ-0040-interpréteur** : ✅ **TRANCHÉE (Décision 7) = callback vers un service-interpréteur Go.** L'interpréteur reste Go gouvernable, exposé en service (outil MCP) ; les handlers Hono/TS l'appellent via un client typé ; pas de ré-émission TS. Réalisée en S90/S77. (Conséquence assumée : un sidecar Go dans le déploiement de l'app émise.)
- **OQ-0040-front** : framework front exact de l'app émise (Hono JSX/SSR vs Hono comme API + client `hc` séparé) — tranché en **S93**. Thème/i18n inchangés.
- **OQ-0040-driver** : choix du client Postgres TS (postgres.js / Drizzle / Kysely) et re-mesure des caveats Doltgres beta contre lui — tranché par le spike **S88** (slot `replaceable`, ADR au step).
- **OQ-0040-linear** : l'issue `EL00 · …` (projet AIDOS `aidos-2a9085453be8`, label `adr`) à créer/déplacer en `Done` au prochain run authentifié (CLAUDE.md §11, best-effort, ne bloque pas le step).

## Addendum — 2026-06-14 : la STACK MULTI-PLATEFORME de l'app émise — UNE spec → N plateformes (Hono+React+Expo+Electron) + le SIDECAR INTERPRÉTEUR Go, prouvé runnable

> **Statut : ACCEPTÉ — gravé par l'utilisateur (2026-06-14).** Cet addendum **n'efface rien** (anti-overwrite §9) ; il **confirme** la frontière constructrice ≠ construite (Décision 1) et la Décision 7 (l'interpréteur reste Go gouvernable, appelé par callback), et **grave** ce que la décision impliquait sans le nommer : l'app émise n'est pas *une* application — c'est **une seule spec qui se projette vers N plateformes**, chacune une cible déterministe ; et la clé de voûte runtime de toutes ces plateformes est **le même sidecar interpréteur Go**.

**Décision utilisatrice (2026-06-14) — « une spec → N plateformes ».** Depuis la SOURCE déclarée au-dessus du mur (entités · opérations · invariants · vues · contrôles — content-adressée, append-only), AIDOS émet l'app utilisateur sur **plusieurs surfaces à la fois**, chacune une **projection déterministe byte-stable** de la même vérité. La plateforme est une **dimension de l'émission**, jamais une seconde source à maintenir (la même règle que la cible de déploiement, ADR 0043/DP33). *Une source → N plateformes.*

### La stack multi-plateforme gravée (la matrice cible)

| Plan | Cible | Choix gravé | Statut |
|---|---|---|---|
| **Backend (serveur émis)** | router HTTP, operations→routes | **Hono / TypeScript** pur-fonctionnel (handler valide/route/projette, « functional core, imperative shell ») | mandatory |
| **Backend (exécution op→DB)** | exécuter les opérations sur la base | **SIDECAR INTERPRÉTEUR GO** — un service qui **réutilise `operation.Interpret` VERBATIM**, écrit le schéma de l'app émise (jamais une vérité) | mandatory |
| **Web** | app web | **React** (Hono + React — SSR/JSX ou API Hono + client `hc` typé, tranché S93) | mandatory |
| **Mobile** | app mobile native | **Expo / React Native** (« expo go ») — partage le client typé `hc` et les types `TargetTSTypes` | mandatory |
| **Desktop** | « l'app en dur » | **Electron** — empaquète le même front React + le serveur Hono + le sidecar | mandatory |

Le fil rouge : **un seul modèle de types partagé** (`TargetTSTypes`) et **un seul client de données typé** (`hc` de Hono) irriguent Web (React), Mobile (Expo/React Native) **et** Desktop (Electron) — pas de double-typage, pas de re-déclaration par plateforme. Le **DDL Postgres** (`TargetPgDDL`) et le **datastore** (ADR 0006, dialecte Postgres, Doltgres opt-in, Atlas) sont **neutres à la plateforme** et inchangés.

### Le sidecar interpréteur Go — la clé de voûte runtime (Décision 7 réalisée)

L'Operation-DSL ne s'exécute **qu'en Go**, **une seule fois**, **gouvernablement** : le **sidecar interpréteur** est ce service. Il **réutilise `operation.Interpret` VERBATIM** — **aucune règle d'interprétation n'est réimplémentée**, et il n'est **jamais** ré-émis en TS (pas de duplication d'une logique gouvernée, une seule source d'interprétation autoritaire — determinism-first, §8). Les handlers **Hono/TS** de toutes les plateformes l'appellent à l'exécution via un **contrat HTTP** :

- **`POST /interpret`** `{operation, input, auth?}` → `{result, events}` — le port émis `OperationInterpreter = (operation, input) => Promise<unknown>` s'y branche directement ; erreurs honnêtes (`404` op inconnue, `403` deny policy, `422` règle métier, `400`/`405`).
- **`GET /healthz`** → `{status:"ok", operations:[…]}`.

**Le pont State↔DB vit ENTIÈREMENT dans les seams** (`operation.Deps` : Validator/Authorizer/Reader/Mutator). `operation.Interpret` reste **pur** et passe ses effets **par** ces seams — c'est le contrat (`operation/deps.go`), par **design**, pas un gap : le job du sidecar est exactement de **fournir** ces seams. Le sidecar offre deux implémentations : **`MemDeps`** (seams en mémoire — le chemin logique-pure du miroir) et **`DBDeps`** (le pont **pgx** réel sur le **schéma émis** : read=`SELECT`, create=`INSERT … RETURNING *` avec id **content-adressé** via `records.Hash`, clear=`DELETE`). **Mur §2 : le sidecar n'écrit QUE les tables de l'app émise** — jamais `kernel`/`mirrors`/`fitness`.

**Prouvé runnable aujourd'hui (pas supposé).** `back/runtime/interpretsvc/` (logique pure importable + seams mémoire + pont pgx + serveur HTTP) et `back/cmd/aidosinterpreter/` (le service `main`, `PORT` 8080, `DATABASE_URL` absent → mode démo seedé / présent → `DBDeps`) — **13 miroirs, tous verts** : 4 fonctionnels (`createOrder` crée un `Order` depuis le cart, vide le cart, émet `[OrderCreated, CartCleared]` ; DENY / op-inconnue / cart-absent = échecs typés sans `Order`), 1 property rapid (même input+state → même effet), 6 contrats de fil `httptest`, 2 d'intégration **Testcontainers + Postgres réel** (read/insert/delete réels, skip gracieux sans Docker). Binaire booté, `curl /interpret` a renvoyé un `Order` réel.

### Le shop server Go était une DIVERGENCE de spec (corrigée vers Hono)

La slice §S46 avait livré un serveur de boutique **en Go** (`http.HandlerFunc` émis délégant à `operation.Interpret` in-process) : c'était une **divergence** de la spec d'émission — l'app émise hérite par défaut de la stack de la **constructrice** (le piège que cette ADR a tranché, Décision 1). La cible canonique est **Hono/TS** ; le Go in-process est remplacé par le couple **serveur Hono émis + callback vers le sidecar Go** (Décision 7). Le serveur Go subsiste comme **preuve d'exécution** de l'interpréteur (la parité de comportement que le sidecar préserve), **pas** comme cible de déploiement.

### Le déploiement réel passe par Pulumi (ADR 0043 amendé)

Le **déploiement** de l'app émise multi-plateforme — bundle **Hono/TS** (front React + routing back) **+ le sidecar interpréteur Go** comme seule dépendance Go (partagée, gouvernée, versionnée avec le Kernel) — est provisionné par **Pulumi** (ADR 0043, addendum 2026-06-13) : un **stack par projet×env** via `@pulumi/docker` (réel, prouvé par `demoshop-dev` live, routé Traefik + Let's Encrypt), portable vers `future_cloud` par simple changement de stack/provider (DP33). L'app **mobile** (Expo) et **desktop** (Electron) s'empaquètent par leurs toolchains natives (EAS / electron-builder) au-dessus du **même** serveur Hono + sidecar.

### Déterminisme / mur (inchangés, §2/§6/§8)

- **Émetteurs purs byte-stables :** chaque cible de plateforme est une **projection déterministe** de la source (même Kernel → mêmes octets, par cible) ; aucun LLM dans l'émission.
- **Le sidecar n'écrit AUCUNE vérité :** il **réutilise** `operation.Interpret` (la source d'interprétation, jamais dupliquée) et n'écrit que le schéma de l'app émise (below-the-line) ; SQL byte-stable (colonnes triées), id content-adressé.
- **Une source, N plateformes :** la plateforme est une **dimension** de la projection, jamais une seconde déclaration ; le mur, le mirror-first et les neuf `phases` du contrat de step restent intacts (garde ajoutée, jamais retirée).

### OpenQuestions de l'addendum (documentées, non truquées — le sidecar est runnable aujourd'hui)

- **OQ-SIDECAR-clear-where** *(le « marche » réel)* : `operation.evalMutate` ne forwarde au seam `Mutator` que le `Data` du step — la **cible** du verbe `clear` vit dans le `Where` (`{id:$.cart.id}`) que l'interpréteur **ne transmet pas** encore. Le seam dérive la cible **honnêtement** du State (slot `$.<entity>` lié par le read), jamais une règle réimplémentée ; un `Where` non dérivable est **refusé** (jamais de table wipe). Le vrai correctif (thread `m.Where` au Mutator) est un **changement Kernel**, hors de cette surface.
- **OQ-SIDECAR-validate / -policy / -expr / -registry** : `Validator` = check minimal ; `Authorizer` = verdict configurable (vrai = évaluateur Policy ∀) ; `sum()` pour `total` non câblé (même OQ que la slice §S46) ; la `Registry` (coupe d'opérations) ancre `createOrder`, le loader `kernel.operation` étant le tooth suivant (`NewRegistry` prend toute coupe). Tous **forward-deps documentés**, ne bloquent pas.

### Sur l'implémentation (la preuve)

- `back/runtime/interpretsvc/{interpretsvc.go, memdeps.go, dbdeps.go, http.go, README.md}` — logique pure + seams mémoire + pont pgx réel + serveur HTTP.
- `back/cmd/aidosinterpreter/{main.go, Dockerfile}` — le service `main` (distroless multi-stage).
- **Gates :** `go build ./...` OK (module entier, voisins `operation`/`honoemit`/`checkout` sans régression) ; `go test ./runtime/interpretsvc/` **vert** (13 tests) ; `-race` clean ; gofmt/vet propres ; aucun binaire ELF parasite.