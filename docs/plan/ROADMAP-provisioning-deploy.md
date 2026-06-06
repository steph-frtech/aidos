# ROADMAP — « Provisionner & Déployer VOTRE app émise avec AIDOS »

> **Statut :** feuille de route produit de provisioning/déploiement. Espace d'id **DP** (`DP01..DP33`). **EXTENSION** de la feuille `ROADMAP-app-builder.md` (S53–S117), jamais une duplication : EPIC F **étend** S94–S99 et **réutilise** S78 (ré-projection), S88/S89 (datastore), S91 (secrets), S95 (migration de donnée d'app). Le cœur déterministe (DSL Kernel, émetteurs `back/runtime/generators`, mur hook+GRANTs, miroirs/complétude, content-store S02, ledger Merkle GV03, TruthScope S15, AuthorityGraph S16, AgentLayer 5-axes) **n'est PAS reconstruit — il est réutilisé tel quel**. Tout ajout est **additif** (anti-overwrite §9).
>
> **Source de vérité du concept :** `KRD.md` (le Tome) + `CLAUDE.md`. Cette feuille est un **guide** (feedforward) ; si elle contredit un miroir vert, le miroir gagne.
>
> **Stack de l'app ÉMISE (la construite ≠ AIDOS la constructrice) — ADR 0040 / EL00 :** **Hono (front + back), pur TypeScript fonctionnel** ; datastore = **dialecte Postgres + Atlas** (ADR 0006 : **plain-Postgres prod par défaut, Doltgres opt-in NON-PROD**, spike-gated S88) ; Operation-DSL = **callback vers un service-interpréteur Go (sidecar)** — Décision 7. AIDOS reste **Go gouvernable** et n'émet jamais de Go pour l'app utilisateur. Le mandat fonctionnel FN02/ADR 0036 s'applique verbatim au code émis TS.
>
> **Contrat de sortie réutilisé (ADR 0007, reuse-don't-reinvent) :** le mécanisme **/data/dockers boilerplate→deploy** est le **CONTRAT DE SORTIE de l'émetteur**, reproduit DÉTERMINISTIQUEMENT (jamais un script `select`/`sed`/humain-dans-la-boucle dans le produit). Conventions reproduites verbatim : `container_name: ${APP_NAME}`, `env_file: .env`, services reverse-proxiés **sans ports publiés** attachés au réseau externe `traefik_default`, exposés par **labels Traefik** (`${APP_SUBDOMAIN}.${DOMAIN}`, `${CERT_RESOLVER_NAME}`, routeur HTTPS websecure/tls **+** middleware redirect HTTP→HTTPS), persistance = **volume nommé bind** vers `${APP_DATA_PATH}` (`driver_opts: {type:none, device:…, o:bind}`), le déploiement `traefik` publie seul 80/443 et **OWNS** `traefik_default` (externe partout ailleurs), à monter en premier. Le geste interactif `select`/`sed`/merge-env (global→bp-default→bp-secrets→chmod 600) est ce que KRD **REMPLACE** par un émetteur content-adressé déterministe → compose/.env/scripts **byte-identiques** (miroir de reproductibilité).
>
> **Exécutable par `/long-run` :** chaque étape est minimale (une capacité vérifiable), autonome (mocke ce qui n'existe pas encore, jamais l'inverse), **mirror-first** (un miroir rouge Gherkin N0 / propriété ∀ N1 / fixture `state→cmd→events` N2 AVANT le code, persisté dans `mirrors`, matérialisé pour le runner — ce rouge EST le `/goal`), **wall-respecting** (toute écriture-vérité = `propose → ChangeSet → approbation` ; below-the-line agit direct ; aucun GRANT agent sur `kernel`/`mirrors`/`fitness`), **determinism-first** (tout ce qui peut être une fonction pure DOIT être code et faire autorité — parse/hash/diff/route/render/EMIT/port-resolve/env-projection ; LLM = exception barricadée, isolée + miroir-vérifiée), **visualisable** (une route Workbench **exécutable** + un e2e Playwright), **thémée** (ADR 0010 : zinc + blue-600) **+ bilingue** (ADR 0011 : `next-intl`, FR d'abord), **non destructive**, **chaînable** (laisse une phase stable). Chaque étape suit la boucle §6 et ouvre son ticket Linear ; chaque étape ship ses **deux pages Mintlify** (« Pour moi » concept + internals Méta/Méta-méta ; « Pour les futurs utilisateurs » si user-facing).
>
> **Le premier pas de chaque capacité majeure est un SPIKE-gate (ratchet OFF, rigueur T0, code jetable)** qui peut **tuer le sujet** s'il ne porte pas sa valeur : DP01 (StackManifest-as-source), DP10 (bootstrap déterministe), DP14 (palette substrat), DP19 (couche connecteurs).
>
> **Done par étape (calculé, §8) — non négociable, s'ajoute aux critères de chaque DP :** red set → vert ∧ vert antérieur intact ∧ **score de mutation ≥ seuil (gremlins/StrykerJS)** ∧ **aucun monstre** (toute nouvelle source above-the-line — `stack_manifest`, `connector`, `skill`, `mcp_server` — a une **entrée dans le schéma `mirrors` + un miroir vivant** ; la complétude bloque sinon). Chaque DP ship aussi ses **deux pages Mintlify** (`mint validate` + `mint broken-links` propres, poussées) et ouvre/avance son **ticket Linear** (`In Progress` → `Done` à la vérification). Un verdict de spike (DP01/DP10/DP14/DP19) est un **record content-adressé append-only** (`/harvest` → Idea + ADR), jamais une déclaration en prose.

---

## Revue critique KRD — amendements contraignants (priment sur le texte d'étape en cas de conflit)

> Issus de la passe adversariale KRD-puriste (verdict initial = *REQUEST CHANGES*). **Ces amendements font autorité** ; ils corrigent des dérives où le texte brut d'étape encodait une vérité qu'aucun ADR n'a actée, ou confondait deux portes du mur.

- **A1 — BLOCKER (Doltgres en prod).** Le texte d'étape grave un invariant `DOLTGRES_NOT_ALLOWED_IN_PROD` dans des miroirs (DP06/DP11/DP15). **ADR 0006 laisse `défaut vs opt-in` comme OPEN QUESTION et n'établit AUCUN gate par environnement.** L'intention utilisateur (« Doltgres hors-prod uniquement ») est légitime mais c'est un **changement de frozen-stack** : il doit passer par un **ADR-addendum à 0006 ouvert AU-DESSUS DU MUR avant DP06**, pas par un miroir qui fige une décision non actée. ⇒ DP06/DP11/DP15 **dépendent** de cet ADR-addendum (fork explicite, OpenQuestion à griller) ; tant qu'il n'est pas accepté, le datastore est un **slot replaceable par app** (Postgres défaut, Doltgres opt-in, sans gate d'env), conforme à 0006 verbatim.
- **A2 — BLOCKER (porte d'approbation des connecteurs).** Le texte (DP19/DP21) réutilise `authority.Decide` (S16) — le **décideur d'ADMISSION DE VÉRITÉ** (`DecisionAdmitted`, la seule porte du mur pour une vérité Kernel) — pour gater un **effet RUNTIME** de connecteur RW (un POST Slack, etc.). **C'est une confusion de catégorie du mur.** ⇒ séparer les deux : la **DÉCLARATION** d'un Connector (source record, classification/scope) est above-the-line → `propose → ChangeSet → approbation`, renvoie `proposed` ; l'**APPROBATION D'EXÉCUTION RW** est une **autorisation runtime below-the-line** = enforcers agentlayer (set-membership fail-closed) **+ une porte HITL runtime distincte** (`ConnectorRuntimeApproval`, jamais `authority.Decide`). Les codes ne se confondent jamais.
- **A3 — MAJOR (AI-never-direct-to-DB = prédicat pur).** L'invariant `AI_DIRECT_DB_ACCESS_FORBIDDEN` (DP20/DP21) doit être une **appartenance ensembliste**, jamais une heuristique de nom d'hôte ni un jugement LLM : `egress_hosts(connector ai) ∩ {endpoints des services role=datastore du StackManifest} = ∅`. Le miroir épingle ce set-membership (même manifest + même connecteur → même verdict). Aucun invariant `AI_DIRECT_DB` n'existe aujourd'hui dans le code (grep = 0) : c'est une **nouvelle vérité** à graver via le mur.
- **A4 — MAJOR (déterminisme de la résolution de ports).** DP12 ne peut pas à la fois prétendre « fonction pure » ET « octets identiques sur toute machine » : lire `ss`/`docker ps` dépend de l'**état hôte mutable observé**. ⇒ scinder : le **miroir byte-identique** (DP05) couvre le **bundle ÉMIS** (compose/.env.example/scripts), pur depuis la phase ; la **résolution au bootstrap** (.env concret, ports résolus) est déterministe **uniquement comme fonction de (bundle, snapshot d'état hôte explicite)** — le snapshot devient un **input explicite**, jamais « sur n'importe quelle machine ».
- **A5 — MAJOR (forward-dependency sur les targets d'émission TS).** `generators.go` aujourd'hui = `{TargetGoSqlc, TargetPgDDL, TargetTSTypes}` **uniquement** ; les targets Hono/TS (`TargetHonoHandler`/`Worker`/`TsClient`) sont du **travail app-builder S87/S90/S93 NON ENCORE BÂTI**. EPIC A/F en **dépendent** : DP03 (émetteur compose) et DP15/DP25/DP26 ne démarrent **qu'après** que les targets TS + S88/S89 (datastore) soient **verts**. C'est une **forward-dependency par design (exception bootstrap CLAUDE.md), OpenQuestion documentée, ne bloque pas** — mais ce n'est PAS « réutilisé tel quel ». Le nouveau `TargetDockerCompose` (DP03) atterrit **dans/après S87**.
- **A6 — MINOR (élargir `scope.Environment`).** Ajouter `local` + `future_cloud` à l'ensemble clos S15 (`scope.go`, aujourd'hui `{prod,staging,dev}`) est un **changement de vérité** : le **même ChangeSet** doit mettre à jour `environmentOrder`, le message d'erreur `Validate`, `IsKnownEnvironment`, `scope_property_test.go` et `migration_roundtrip`, et un **SemanticDiff** doit prouver qu'aucune vérité scopée existante n'est invalidée (additif seulement). Idem : ajouter le record kind `stack_manifest` (DP02) **exige un SemanticDiff** (§9).
- **A7 — MINOR (honnêteté d'outillage, determinism-first).** Nommer les outils gelés exacts, jamais « type-X » : **gitleaks** (slot budgets ADR 0003) pour le scan de secrets ; pour `EMITTED_NO_HARDCODED_ENDPOINT`, une **passe AST TS (`ts-morph` / le parseur call-graph FN05 déjà choisi ADR 0040) alimentant une règle dependency-cruiser** — jamais un « linter de motif » ad-hoc. Choix enregistré dans l'ADR de l'étape (tool-search par étape).

---

## Pré-vol — accrétion d'artefacts (CLAUDE.md §6/§7)

> **Pas une étape de code.** Avant `/long-run {startFrom:'DP01'}` : créer les agents `step-DPnn` (DP01–DP33) via `agent-creator` (héritant `step-executor`, aucune allowlist `tools:` stricte) ; câbler `PLAN.md` (une entrée par `docs/plan/DPnn-*.md` à semer par `/grill-with-docs`) et `TEST_PLAN.md` (un scénario par flux critique : stack-emit, bootstrap, connecteur RW gaté, deploy-by-phase, rollback) ; **scaffolder sans activer** les hooks + MCP des **deux plans** (outillage AIDOS *et* app émise) ; redémarrer la session Claude pour enregistrer agents/skills/MCP. Un hook qui ne tire jamais est un monstre — activé + fault-injecté uniquement à l'étape qui en a besoin.

---

## EPIC A — StackManifest : la déclaration content-adressée de la stack émise (SOURCE au-dessus du mur)

## DP01 — SPIKE-gate : StackManifest comme source de premier rang (ratchet OFF, peut tuer le sujet)

**Sous-système :** Kernel / Runtime (spike, `/spike` zone, rigueur T0)
**Objectif :** Avant de graver quoi que ce soit, prouver par mesure que **déclarer la stack comme une SOURCE Kernel content-adressée** (gouvernée par le mur) porte sa valeur face à un simple template statique `/data/dockers`. Sonder : un `StackManifest` minimal (nom d'app, liste de services avec image/port-interne/profile, volumes nommés, réseau, scopes connecteurs) → un émetteur jetable produisant un `docker-compose.yml` qui respecte les conventions /data/dockers → vérifier la **ré-émission byte-identique** et la **détection de dérive par source-hash**. Verdict = **mesure** (go : la source porte versioning/audit/anti-overwrite ; no-go : un template statique suffit, on tue le sujet et la roadmap s'arrête à DP01).
**Detail :** Code jetable dans `/spike` uniquement (aucune écriture-vérité, aucun GRANT, ratchet OFF). Comparer ≤ 3 formes : (1) StackManifest record kind de premier rang ; (2) dimension du TruthScope S15 ; (3) projection below-the-line pure. Mesurer le coût d'émission, la stabilité du hash, la facilité d'audit. Harvester le verdict en `Idea` DRAFT (`/harvest`) + ADR au step.
**Inputs :** `/data/dockers/boilerplates/nodejs/docker-compose.yml`, `/data/dockers/CLAUDE.md` (§Boilerplate→deployment), `generators.go` (pattern Target/Kind/Artifact), `back/kernel/scope/scope.go` (S15), ADR 0040, ADR 0007.
**Critères de done :**
- **Miroir (spike, T0) :** fixture jetable — `StackManifest{services,volumes,network}` → émetteur jetable → compose qui round-trip ; ré-émission N fois = **octets identiques** (parité byte). Le spike **asserte** soit go (source porte sa valeur), soit no-go reproductible (template suffit). Verdict enregistré comme record `/harvest`, jamais une déclaration.
- **Mur :** zone `/spike` exclusivement ; aucune écriture dans `kernel`/`mirrors`/`fitness` ; le hook PreToolUse refuse toute fuite hors `/spike`.
- **Déterminisme :** émetteur jetable = fonction pure (pas d'horloge/RNG/ordre de map) ; le verdict est une **mesure** (hash égal/inégal), jamais un avis LLM.
- **UI :** route Workbench `/stack-spike` (lecture seule, thémée+bilingue) affichant le verdict go/no-go + les octets comparés ; Playwright e2e — la page rend le verdict du spike.
- **KRD :** ratchet OFF (§S41/spike) ; si no-go, ADR « StackManifest abandonné, template /data/dockers retenu » et la roadmap s'arrête honnêtement.

## DP02 — StackManifest : DSL AST + record kind content-adressé (la SOURCE)

**Sous-système :** Kernel
**Objectif :** Si DP01 est go, graver le **StackManifest comme source Kernel de premier rang** : un AST déclaré (app name, `services[]` {name, role∈{server|datastore|cache|pooler|workflow|bus|observability|errortracking|git|tickets|auth|docs|connector|interpreter}, image-ou-emitted, internal_port, profile, healthcheck, depends_on}, `volumes[]` {name, bind_path}, `network` {name, external}, `connector_scopes[]`), content-adressé via `records.Hash(records.Canonicalize(body))` (S02 réutilisé, jamais forké), append-only.
**Detail :** Ajouter le record kind `stack_manifest` au schéma `kernel` (migration Atlas additive). Ensemble de rôles **CLOS** (honnêteté : un rôle inconnu = BlockReason, jamais deviné). Le manifest **déclare** la topologie ; il ne résout aucune URL ni secret (c'est la projection par environnement, EPIC B). Validation pure (`validateStackManifest`) : nom requis, au moins un service `role=server`, ports internes uniques par app, profiles dans l'ensemble clos.
**Inputs :** DP01 verdict (go), `generators.go` (EntitySource pattern), `back/kernel/records`, ADR du provider de stockage manifest.
**Critères de done :**
- **Miroir (property ∀ N1) :** un `StackManifest` round-trip comme AST content-adressé (même body → même hash) ; un rôle hors-ensemble-clos est refusé (`UNKNOWN_SERVICE_ROLE`) ; deux ports internes identiques refusés (`DUPLICATE_INTERNAL_PORT`) ; un manifest sans service `server` refusé (`STACK_HAS_NO_SERVER`).
- **Mur :** le `stack_manifest` est une vérité **above-the-line** — écrite uniquement par `idée → miroir → /goal → approbation` ; l'agent n'a aucun GRANT ; un essai d'écriture directe est refusé.
- **Déterminisme :** parsing/validation/hash = fonctions pures ; miroir de reproductibilité (même AST → même hash, 100 % identité). **Mirror KRD note :** un layer `stack_manifest` sans miroir vivant = monstre (complétude bloque le step).
- **UI :** route `/stack-manifest` (lecture du manifest du projet courant, thémée+bilingue) ; Playwright e2e — afficher un manifest seedé.
- **KRD :** réutilise S15 (scope `project_id`+environment posé en DP06), S16 (authority d'approbation).

## DP03 — Émetteur StackManifest → docker-compose.yml (contrat de sortie /data/dockers)

**Sous-système :** Generators
**Objectif :** Un nouveau **Target additif** `TargetDockerCompose` (enregistré dans `targetOrder`, jamais inventé ad-hoc) : `Emit(stack_manifest, TargetDockerCompose)` produit un `docker-compose.yml` **byte-identique** reproduisant les conventions /data/dockers — `container_name: ${APP_NAME}`, `env_file: .env`, services reverse-proxiés sans ports publiés sur `traefik_default` externe, labels Traefik (routeur HTTPS websecure/tls + middleware redirect HTTP→HTTPS), volumes nommés bind `driver_opts:{type:none,device:${APP_DATA_PATH},o:bind}`, `restart: unless-stopped`, healthcheck par service.
**Detail :** Émetteur pur (header `ProtectedMarker` + `source_hash`, pattern `emit.go`) : `mapServices(sorted)`, `renderTraefikLabels`, `renderVolumes`, fold `strings.Join`, ordre stable, newlines `\n`, aucune horloge/RNG. Le compose émis est l'artefact déployable complet (fork B → recommandation A : émission déterministe, jamais template hand-edité).
**Inputs :** DP02, `/data/dockers/boilerplates/{nodejs,payload}/docker-compose.yml` (conventions exactes), `emit.go` (header/mapFields/renderXxx), ADR 0036 (EMITTED_FUNCTION_PURE).
**Critères de done :**
- **Miroir (property ∀ N1) :** même `StackManifest` → compose **byte-identique** N fois ; un service `role=server` émet routeur HTTPS + middleware redirect HTTP→HTTPS ; un volume émet le bind `${APP_DATA_PATH}` ; `traefik_default` est `external: true` (sauf le déploiement traefik lui-même qui l'OWNS). Un fichier généré hand-edité est rejeté (drift par source-hash).
- **Mur :** émetteur SELECT-only sur `kernel`, écrit la projection **below-the-line** (`back/gen/<project>/docker-compose.yml`) ; aucune écriture-vérité.
- **Déterminisme :** `Emit` = fonction pure de `Canonicalize(manifest)` ; **miroir de reproductibilité** byte-identique (100 %, pas 99 %).
- **UI :** route `/stack-emit` (affiche le compose émis + son `output_hash`, thémée+bilingue) ; Playwright e2e — émettre, voir le compose, voir le hash.
- **KRD :** Target ajouté **additivement** (matrice kind×target enumérable close) ; gen/ protégé.

## DP04 — Émetteur StackManifest → .env.example + scripts (merge-order déterministe, sans secrets)

**Sous-système :** Generators
**Objectif :** Émettre déterministiquement le `.env.example` (toutes les clés que l'app attend : `APP_NAME`, `APP_SUBDOMAIN`, `DOMAIN`, `CERT_RESOLVER_NAME`, `APP_DATA_PATH`, `TRAEFIK_NETWORK_NAME`, ports internes, **références** de secrets — jamais les valeurs) + les scripts `start.sh`/`start_with_rebuild.sh` (down→up / down→build --no-cache→up), reproduisant l'ordre de merge /data/dockers (global→bp-default→bp-secrets→deploy-time) **comme template d'émission**, jamais un `sed` interactif.
**Detail :** Le `.env.example` ne contient **aucune valeur de secret** (placeholders `<<from-secret-store>>`). L'ordre de merge est gravé dans l'émetteur (fonction pure), pas exécuté par un shell humain. Les scripts émis sont les artefacts byte-stables.
**Inputs :** DP03, `/data/dockers/CLAUDE.md` (§merge env, §generate start.sh, §chmod 600), S91 (secret store, branché en DP32).
**Critères de done :**
- **Miroir (property ∀ N1) :** même manifest → `.env.example` + scripts byte-identiques ; le `.env.example` contient **zéro valeur de secret** (scan déterministe type-gitleaks sur l'émission → vert) ; toutes les clés référencées par le compose (DP03) existent dans le `.env.example` (cohérence).
- **Mur :** émetteur below-the-line ; secrets jamais dans le source émis (réutilise le contrat S91 — chiffré, scopé `project_id`, jamais dans truth-store/git/source).
- **Déterminisme :** ordre de merge = fonction pure gravée ; **miroir de reproductibilité** byte-identique ; scan secret = code (gitleaks), jamais LLM.
- **UI :** route `/stack-emit` étendue (onglet .env.example + scripts) ; Playwright e2e — voir le .env.example sans valeurs sensibles.
- **KRD :** anti-overwrite §9 (régénérable, jamais hand-edité).

## DP05 — Émetteur complet de stack par phase + miroir de re-émission byte-identique

**Sous-système :** Generators / Runtime
**Objectif :** Composer DP03+DP04 en une **émission de stack complète** déterministe depuis une **phase DAG** (réutilise S78 « Régénérer mon app ») : `EmitStack(phase) → {docker-compose.yml, .env.example, start.sh, start_with_rebuild.sh, traefik dynamic config}`, hash-protégée, avec le **miroir-pierre-angulaire de reproductibilité** : même phase → mêmes octets sur toute machine.
**Detail :** `EmitStack` est la fonction réutilisée par le preview (DP25) et le deploy (DP26) — ils **ne choisissent jamais** entre artefacts, ils ré-émettent. Branche le sidecar interpréteur Go (fork E → recommandation A : service du StackManifest `role=interpreter`, profile core, joignable docker_internal). Détection de projection périmée par source-hash (un fichier hand-edité refuse la re-émission silencieuse).
**Inputs :** DP03, DP04, S78 (ré-projection), S23 (phase stable), ADR 0040 Décision 7 (sidecar Go).
**Critères de done :**
- **Miroir (property ∀ N1) :** même phase content-adressée → bundle stack **byte-identique** N fois et sur N machines (le miroir central) ; le sidecar interpréteur Go apparaît comme service `role=interpreter` profile core ; un gen/ hand-edité bloque la re-émission (`EMITTED_FILE_HAND_EDITED`).
- **Mur :** ré-émission below-the-line ; la phase (source) est autoritative, le code émis est régénérable et jamais l'inverse.
- **Déterminisme :** `EmitStack` = fonction pure de la phase ; **miroir de reproductibilité** le prouve (la pierre angulaire de tout l'épic).
- **UI :** route `/stack-emit` montre le bundle complet par phase + bouton « ré-émettre » (exécutable) ; Playwright e2e — ré-émettre deux fois, comparer les hash (égaux).
- **KRD :** §S34 byte-identique ; S96 « ré-émet depuis la phase » ; aucune nouvelle porte d'écriture-vérité.

---

## EPIC B — Modèle d'environnements + projection du mode de connexion (zéro endpoint hardcodé)

## DP06 — Modèle Environment + scope par environnement (réutilise TruthScope S15)

**Sous-système :** Kernel
**Objectif :** Un modèle `Environment` ∈ {`local`, `dev`, `staging`, `prod`, `future_cloud`} **réutilisant `TruthScope.environment` de S15** (pas un nouveau modèle parallèle) ; chaque environnement déclare ses bindings de connexion (mode par service) et ses URLs/TLS comme **projection below-the-line** (fork StackManifest → recommandation : Environment résolu = projection, jamais source). `prod` impose **Postgres** (jamais Doltgres) ; `future_cloud` est déclaré dès maintenant pour la portabilité (EPIC G).
**Detail :** L'Environment n'invente pas d'enum : il **étend l'usage** de `scope.Environment` (qui porte déjà `prod|staging|dev`) en ajoutant `local` et `future_cloud` (migration additive de l'ensemble clos S15, via le mur). Une vérité active sans scope d'environnement est refusée (`scope.Validate` fail-closed, S15 inchangé).
**Inputs :** `back/kernel/scope/scope.go` (S15, ensemble clos environment), DP02, ADR amendant l'ensemble environnement.
**Critères de done :**
- **Miroir (property ∀ N1) :** `scope.Validate` reste fail-closed (vérité active sans environnement = rejetée) ; l'ajout de `local`/`future_cloud` est additif (les scopes existants restent valides). **(Amendement A1)** le refus `prod`+Doltgres n'est gravé en miroir **que si** l'ADR-addendum à 0006 est accepté au préalable (sinon le datastore reste un slot replaceable par app, sans gate d'env — ADR 0006 verbatim). **(Amendement A6)** le même ChangeSet met à jour `environmentOrder`, le message `Validate`, `IsKnownEnvironment`, `scope_property_test.go`, `migration_roundtrip`, et un **SemanticDiff** prouve l'additivité.
- **Mur :** l'extension de l'ensemble clos S15 est un **changement de vérité** (idée→miroir→/goal→approbation), pas une édition de code ; l'ADR-addendum Doltgres-non-prod (A1) s'ouvre **avant** DP06.
- **Déterminisme :** validation de scope = fonction pure totale (S15 réutilisée).
- **UI :** route `/environments` (liste des 5 environnements + leurs bindings, thémée+bilingue) ; Playwright e2e — voir les environnements du projet.
- **KRD :** réutilise S15 (zéro universel implicite ; `IsGlobal` explicite seulement).

## DP07 — Projection du mode de connexion : docker_internal / traefik_url / managed_url

**Sous-système :** Runtime / Generators
**Objectif :** Une **projection déterministe** `resolveConnection(service, environment) → ConnectionMode` ∈ {`docker_internal` (host = nom de service, port interne, réseau partagé), `traefik_url` (`https://${APP_SUBDOMAIN}.${DOMAIN}` via labels), `managed_url` (URL externe gérée, ex. RDS/Snowflake/cloud bus)}. C'est l'algorithme qui câble les services entre eux et vers l'extérieur **sans aucun endpoint hardcodé**.
**Detail :** Fonction pure : en `local`/`dev`/`staging`/`prod` self-hosted, service↔service = `docker_internal` ; exposition publique = `traefik_url` ; un service externe (connecteur cloud, EPIC E) ou `future_cloud` = `managed_url` (résolu depuis l'Environment binding + secret store, jamais en dur). Émet un module de config TS (`process.env`) consommé par le serveur Hono au boot.
**Inputs :** DP06, DP05 (compose émis), S91 (secrets, DP32), `/data/dockers` (réseau traefik_default, labels).
**Critères de done :**
- **Miroir (property ∀ N1) :** `resolveConnection` déterministe (même service+env → même mode) ; en `prod`, un service interne se résout en `docker_internal` (jamais `localhost`/IP en dur) ; un service cloud se résout en `managed_url` depuis l'Environment binding.
- **Mur :** projection below-the-line ; les URLs managées proviennent du secret store (S91), jamais du source émis.
- **Déterminisme :** la résolution est un **algorithme, pas un prompt** ; miroir de reproductibilité.
- **UI :** route `/environments` étendue (matrice service × environnement → mode de connexion) ; Playwright e2e — basculer d'environnement, voir les modes recalculés.
- **KRD :** zéro endpoint hardcodé est l'objet de DP08.

## DP08 — Arch-fitness EMITTED_NO_HARDCODED_ENDPOINT (le ratchet structurel des endpoints)

**Sous-système :** Mirror / Runtime
**Objectif :** Un invariant arch-fitness gravé : **aucun host/URL/port en dur dans le source émis** (handlers Hono, workers, config) — tout endpoint passe par la projection DP07. Enforced par `dependency-cruiser` + un linter de motif déterministe sur `gen/` (jamais un LLM qui « juge si c'est hardcodé »), fail-closed, avec fault-injection.
**Detail :** Le linter scanne les littéraux d'URL/host/IP/port dans l'arbre émis TS ; tout littéral non issu d'un `resolveConnection`/`process.env` rougit le senseur et **bloque la coupe**. Ajouté à l'auto-certification de la boucle-build (S84).
**Inputs :** DP07, S84 (auto-certif), ADR 0036 (arch-fitness émis = dependency-cruiser), `arch-fitness.json`.
**Critères de done :**
- **Miroir (fault-injection N1) :** injecter une URL en dur (`https://1.2.3.4:5432`) dans un fichier émis → le senseur `EMITTED_NO_HARDCODED_ENDPOINT` **rougit et bloque la coupe** ; retirer le littéral → vert. Property — un endpoint résolu via `resolveConnection` passe toujours.
- **Mur :** senseur déterministe ; la config arch-fitness est above-the-line (changement = idée→miroir→/goal).
- **Déterminisme :** détection = motif/parse AST (code), jamais LLM ; **miroir de reproductibilité** (même arbre → même verdict).
- **UI :** route `/endpoints-fitness` (liste des endpoints résolus + statut du senseur, thémée+bilingue) ; Playwright e2e — voir le senseur vert, injecter un hardcode (sandbox), voir rouge.
- **KRD :** un hook qui ne tire jamais est mort — celui-ci a sa fault-injection (CLAUDE.md §5).

## DP09 — Cockpit environnements + matrice de connexion (écran exécutable)

**Sous-système :** Workbench
**Objectif :** Une route Workbench **exécutable** par projet montrant les 5 environnements, la matrice service × mode-de-connexion (DP07), le statut du senseur DP08, et l'action « déclarer/éditer un binding d'environnement » (propose → ChangeSet → approbation pour les bindings qui sont des vérités ; below-the-line pour les déclencheurs de preview).
**Detail :** Réutilise la passerelle MCP-over-HTTP (S58) + le SDK typé (S59). Thémée ccup, bilingue FR-default.
**Inputs :** DP06, DP07, DP08, S58/S59 (passerelle+SDK), ADR 0010/0011.
**Critères de done :**
- **Miroir (Playwright e2e) :** déclarer un binding d'environnement (ChangeSet proposé), l'approuver, voir la matrice de connexion se recalculer, voir le senseur DP08 vert.
- **Mur :** l'écran **propose** un ChangeSet pour les bindings-vérité ; ne touche jamais le Kernel directement.
- **Déterminisme :** la matrice affichée = projection pure (DP07), jamais une estimation.
- **UI :** route `/environments` finalisée, action-capable, thémée+bilingue (pas display-only).
- **KRD :** tout se fait par écran ; aucune capacité headless.

---

## EPIC C — Bootstrap one-shot déterministe + profiles de compose

## DP10 — SPIKE-gate : bootstrap déterministe one-shot vs réutilisation directe de deploy.sh (peut tuer le sujet)

**Sous-système :** Runtime (spike, `/spike`, T0)
**Objectif :** Prouver par mesure qu'un **bootstrap déterministe one-shot émis** (réseaux→volumes→.env→secrets-check→résolution-ports→start-ordonné→healthchecks→print-URLs) bat le fait d'appeler directement `/data/dockers/deploy.sh` (fork deploy.sh → recommandation B : outil séparé). Sonder la résolution de ports déterministe (sans `select` humain), l'ordre de démarrage (traefik d'abord, datastore avant serveur), les healthchecks bloquants. Verdict = mesure ; no-go → on documente la réutilisation directe de deploy.sh et on n'écrit pas DP11-DP13.
**Detail :** Code jetable `/spike`. Comparer ≤ 3 : (1) émetteur bootstrap natif Go déterministe ; (2) wrapper non-interactif autour de deploy.sh ; (3) appel direct deploy.sh. Mesurer reproductibilité, dépendance à la structure /data/dockers, portabilité future_cloud.
**Inputs :** `/data/dockers/CLAUDE.md` (chaîne deploy.sh : copy→merge→APP_NAME→résolution ports host ss+docker ps→substitution→generate start.sh→chmod 600), DP05 (bundle émis), DP07 (modes de connexion).
**Critères de done :**
- **Miroir (spike, T0) :** fixture jetable — un bundle émis + un bootstrap jetable démarre traefik→datastore→serveur dans l'ordre, healthchecks verts, URLs imprimées ; la **résolution de port est déterministe** (host `ss` + `docker ps`, sans humain). Le spike asserte go (bootstrap natif porte sa valeur : reproductibilité + indépendance de /data/dockers) ou no-go reproductible.
- **Mur :** zone `/spike` ; aucune écriture-vérité.
- **Déterminisme :** résolution de ports + ordre de démarrage = fonctions pures sur l'état observé (ss/docker ps), jamais un choix interactif ; verdict = mesure.
- **UI :** route `/bootstrap-spike` (lecture, verdict + log de démarrage) ; Playwright e2e — voir le verdict.
- **KRD :** ratchet OFF ; harvest + ADR.

## DP11 — Profiles de compose : core / docs / observability / qa / git / tickets / connectors / non-prod / full

**Sous-système :** Generators / Kernel
**Objectif :** Étendre le StackManifest (DP02) + l'émetteur compose (DP03) avec des **compose profiles** déterministes : chaque service porte un (ou plusieurs) profile dans l'ensemble **clos** {`core`, `docs`, `observability`, `qa`, `git`, `tickets`, `connectors`, `non-prod`, `full`} ; l'émission inclut/exclut les services selon le profile sélectionné, byte-identique par sélection.
**Detail :** `core` = server Hono + interpréteur Go sidecar + datastore + Valkey/PgBouncer. `non-prod` = autorise Doltgres opt-in (jamais en prod). `full` = union. Profile inconnu = BlockReason (`UNKNOWN_PROFILE`). L'émetteur reste pur ; le profile est un paramètre déclaré, jamais inféré.
**Inputs :** DP02, DP03, docker compose profiles (convention), EPIC D (services-substrat).
**Critères de done :**
- **Miroir (property ∀ N1) :** même manifest + même sélection de profile → compose byte-identique ; un profile hors-ensemble-clos refusé (`UNKNOWN_PROFILE`) ; `non-prod` + `prod` environment → Doltgres refusé (DP06) ; `full` = union déterministe des profiles.
- **Mur :** profiles déclarés dans la source `stack_manifest` (above-the-line) ; sélection à l'émission = below-the-line.
- **Déterminisme :** inclusion/exclusion = filtre pur sur l'ensemble clos ; miroir de reproductibilité.
- **UI :** route `/stack-emit` étendue (sélecteur de profile + compose recalculé) ; Playwright e2e — basculer de profile, voir les services apparaître/disparaître.
- **KRD :** ensemble clos enumérable (honnêteté) ; additif.

## DP12 — Bootstrap one-shot déterministe : émetteur de la séquence d'amorçage

**Sous-système :** Runtime / Generators
**Objectif :** Si DP10 est go, émettre déterministiquement le **bootstrap one-shot** : (1) créer/attacher le réseau `traefik_default` (externe), (2) créer les volumes nommés bind, (3) matérialiser le `.env` concret depuis `.env.example` (DP04) + secret store (S91/DP32) en ordre de merge gravé + chmod 600, (4) **secrets-check** (tout secret requis présent, sinon BlockReason), (5) **résolution de ports** déterministe (host `ss` + `docker ps`), (6) **démarrage ordonné** (traefik→datastore→pooler→cache→serveur→workers, par `depends_on`+healthcheck), (7) healthchecks bloquants, (8) **print-URLs**.
**Detail :** Le bootstrap est un émetteur+exécuteur déterministe (pas de `select`/`sed`), reproduisant la chaîne deploy.sh **comme code**. Le `.env` concret n'est jamais committé ni dans le source émis (chmod 600, gitignored). Réutilise le bundle DP05.
**Inputs :** DP10 (go), DP05, DP04, DP07, S91 (secrets), `/data/dockers/CLAUDE.md` (chaîne deploy.sh).
**Critères de done :**
- **Miroir (fixture `state→cmd→events` N2) :** `cmd=bootstrap` sur un bundle émis → events ordonnés (network-created → volumes-created → env-materialized → secrets-checked → ports-resolved → traefik-up → datastore-up → server-up → healthy → urls-printed) ; un secret manquant lève `MISSING_SECRET_AT_BOOT` (actionnable) ; un port occupé est résolu déterministiquement (jamais un prompt). Property — même bundle+même état hôte → même séquence d'events.
- **Mur :** le `.env` concret + secrets vivent dans l'appliance au boot, jamais dans le truth-store/git/source émis ; below-the-line.
- **Déterminisme :** chaque étape (résolution ports, ordre, merge env) = fonction pure ; secrets-check = scan code (gitleaks), jamais LLM ; miroir de reproductibilité de la séquence.
- **UI :** route `/bootstrap` (action « amorcer la stack » exécutable + log d'events live, thémée+bilingue) ; Playwright e2e — amorcer, voir les events ordonnés, voir les URLs.
- **KRD :** remplace le geste interactif deploy.sh par un émetteur déterministe (determinism-first) ; non destructif (append-only des décisions).

## DP13 — MCP bootstrap + profiles (tout op = un outil MCP)

**Sous-système :** MCP / Runtime
**Objectif :** Exposer chaque op de bootstrap/profile comme **outil MCP** (ADR 0009, sans exception) sur la passerelle (S58) : `stack.emit`, `stack.bootstrap`, `stack.select_profile`, `stack.resolve_ports`, `stack.print_urls` — project-scopés, mur appliqué côté serveur (below-the-line agit, vérité via ChangeSet, renvoie `BlockReason` au refus). MCP des **deux plans** : l'outillage AIDOS (provisioning) et l'app émise (ses propres MCP, ADR 0040 Déc. 4).
**Detail :** Réutilise le scaffolding MCP du pré-vol (activé ici). Contrat Pact par outil + provider-verification. Aucun LLM dans le serveur (routage pur).
**Inputs :** DP12, DP11, S58 (passerelle MCP-over-HTTP), ADR 0009.
**Critères de done :**
- **Miroir (Pact + Godog) :** contrat Pact par outil exposé + provider-verification (le HTTP honore le MCP) ; Godog — `stack.bootstrap` round-trip jusqu'à une stack qui tourne ; Testcontainers — l'outil ne contourne pas les GRANTs (un essai d'écriture-vérité renvoie `BlockReason`).
- **Mur :** les outils above-the-line ne renvoient que `proposed`, jamais `admitted` ; below-the-line agit direct.
- **Déterminisme :** routage pur, zéro LLM ; miroir de reproductibilité du routage.
- **UI :** route `/bootstrap` câblée aux MCP via la passerelle ; Playwright e2e — déclencher `stack.bootstrap` depuis l'écran.
- **KRD :** chaque op backend = un outil MCP (ADR 0009) ; un MCP scaffoldé mais jamais activé est mort — celui-ci s'active ici.

---

## EPIC D — Les services-substrat provisionnables par profile

## DP14 — SPIKE-gate : palette de substrat open-source-stack-2026 (peut tuer/réduire le sujet)

**Sous-système :** Archive / Runtime (spike, `/spike`, T0)
**Objectif :** Valider par mesure la **palette de services-substrat** (open-source-stack-2026) avant de la graver en fragments StackManifest : Postgres, Valkey, PgBouncer, **Windmill** (workflows — **jamais Temporal**, contrainte dure), NATS (bus), OTel+SigNoz (observability), GlitchTip (error-tracking), Forgejo (git), Plane (tickets), Better-Auth (auth), Fumadocs/Scalar/Pagefind (docs). Sonder : chaque service boote derrière Traefik avec les conventions /data/dockers, healthcheck, volume bind. Verdict = mesure ; un service qui ne tient pas est retiré (réduit le sujet), pas deviné.
**Detail :** Code jetable `/spike` (réutilise les boilerplates /data/dockers existants : `better-auth`, `supabase`, `dolt`/`doltgresql`, `traefik` comme références de conventions). Chaque service candidate ≤ 1 alternative comparée, slot `replaceable` (ADR au step). Contraintes dures : **pas de Coolify** (orchestration = bootstrap déterministe DP12), **pas de Drizzle imposé** (driver TS = slot replaceable S88), **Postgres prod / Doltgres non-prod**.
**Inputs :** `/data/dockers/boilerplates/` (better-auth, supabase, dolt, doltgresql, traefik, litellm), spec open-source-stack-2026 + connectors, ADR 0003 (slots).
**Critères de done :**
- **Miroir (spike, T0) :** Testcontainers/docker jetable — chaque service de la palette boote, healthcheck vert, joignable docker_internal/traefik_url ; le spike **asserte** par service go (intégrable comme fragment) ou no-go (retiré de la palette, décision enregistrée). Windmill validé comme moteur de workflows (pas Temporal).
- **Mur :** zone `/spike` ; aucune écriture-vérité.
- **Déterminisme :** verdict par service = mesure (boote/healthy ou non), jamais un avis ; harvest + ADR de palette.
- **UI :** route `/substrate-spike` (matrice service × verdict, thémée+bilingue) ; Playwright e2e — voir la palette validée.
- **KRD :** ratchet OFF ; contraintes dures honorées (Coolify out, Drizzle non imposé, Windmill not Temporal).

## DP15 — Fragments substrat : datastore (Postgres prod / Doltgres non-prod) + Valkey + PgBouncer

**Sous-système :** Archive / Generators
**Objectif :** Émettre les fragments StackManifest des services de données : **Postgres** (datastore par défaut prod, profile core), **Doltgres opt-in NON-PROD seulement** (profile `non-prod`, gated par le spike S88 + DP06 `DOLTGRES_NOT_ALLOWED_IN_PROD`), **Valkey** (cache, core), **PgBouncer** (pooler, core). Réutilise S89 (provisioning datastore par app, Atlas, **client TS** — pas sqlc/pgx, ADR 0040) ; provision au deploy (fork datastore-timing → recommandation A : network→volumes→datastore→Atlas→start).
**Detail :** Chaque service = un fragment de service dans le StackManifest avec image, port interne, volume bind, healthcheck, depends_on. Le DDL émis (`TargetPgDDL` inchangé) s'applique via Atlas (réutilise `migrate`/S95). Isolation par projet (`project_id`).
**Inputs :** DP14 (go), DP11 (profiles), S88 (spike Doltgres), S89 (provisioning), S95 (migration), ADR 0006.
**Critères de done :**
- **Miroir (Testcontainers + property) :** le DDL émis s'applique sur Postgres (cible par défaut) ; CRUD round-trip ; Doltgres opt-in en `non-prod` répond à un `as of` ; Doltgres en `prod` refusé (`DOLTGRES_NOT_ALLOWED_IN_PROD`) ; isolation par projet (projet A n'accède pas au datastore de B). Property — fragment émis byte-identique.
- **Mur :** migration destructive human-gated via DataTruthScope (S37) ; below-the-line pour le provisioning.
- **Déterminisme :** émission de fragment + migration reproductibles ; client TS = slot replaceable (ADR S88).
- **UI :** route `/substrate` (services de données + statut, thémée+bilingue) ; Playwright e2e — voir le datastore provisionné, profile.
- **KRD :** ADR 0006 (Postgres prod, Doltgres opt-in non-prod) ; réutilise S89/S95 (pas de duplication).

## DP16 — Fragments substrat : Windmill (workflows) + NATS (bus) + outbox (réutilise S73)

**Sous-système :** Generators / Kernel
**Objectif :** Émettre les fragments de l'exécution asynchrone : **Windmill** (moteur de workflows/jobs — **jamais Temporal**, contrainte dure), **NATS** (bus de messages), branchés sur le **pattern outbox transactionnel de S73** (l'app émise écrit l'effet puis le dispatche, exactly-once relatif). Les workers async émis sont des **workers TS** (ADR 0040, S74), pas Go.
**Detail :** Windmill profile `core` (ou `full`). Le nœud Operation async/scheduled (S73, AST neutre) se **réalise** en worker TS + dispatch via NATS/Windmill. Réutilise S73 (outbox) + S74 (émetteurs relation-aware/async).
**Inputs :** DP14, DP11, S73 (async/outbox), S74 (émetteurs async TS), ADR 0040 (worker TS).
**Critères de done :**
- **Miroir (fixture `state→cmd→events` N2) :** une operation planifiée s'exécute à l'échéance (horloge injectée) et émet ses events via Windmill/NATS ; l'outbox rejoue un effet non dispatché après crash sans doublon observable ; property — la planification est déterministe sur l'horloge injectée.
- **Mur :** below-the-line ; aucune écriture-vérité depuis un worker.
- **Déterminisme :** scheduler = code, jamais LLM ; fragment émis byte-identique ; miroir de reproductibilité.
- **UI :** route `/substrate` étendue (workflows/bus + jobs en cours) ; Playwright e2e — déclencher un job async, voir ses events.
- **KRD :** Windmill not Temporal (contrainte dure) ; réutilise S73/S74.

## DP17 — Fragments substrat : observabilité (OTel + SigNoz + GlitchTip)

**Sous-système :** Runtime / Generators
**Objectif :** Émettre les fragments d'**observabilité d'exploitation de l'app émise** (distincte de la boucle de réalité E12) : **OTel** (JS/TS SDK, ADR 0040, pas Go), **SigNoz** (traces/métriques/logs), **GlitchTip** (error-tracking) — profile `observability`. Réutilise et **étend S92** (observabilité d'exploitation), ne le duplique pas.
**Detail :** L'app émise s'instrumente avec `@opentelemetry/*` (TS) → SigNoz ; les erreurs → GlitchTip. Ces services **n'écrivent aucune vérité** (le RealityMirror E12 est le seul on-ramp Kernel). Fragments émis byte-stables.
**Inputs :** DP14, DP11, S92 (observabilité émise, OTel JS), spec stack-2026.
**Critères de done :**
- **Miroir (Godog + property) :** l'app émise émet logs/traces vers SigNoz, erreurs vers GlitchTip, le dashboard d'ops les rend ; property — l'ops-observabilité **n'écrit aucune vérité** (zéro write Kernel) ; fragment émis byte-identique.
- **Mur :** observabilité d'exploitation ≠ senseur Kernel ; aucune écriture above-the-line.
- **Déterminisme :** instrumentation émise = fonction pure du Kernel ; miroir de reproductibilité.
- **UI :** route `/substrate` étendue (panneau observability, profile) ; Playwright e2e — voir les services obs provisionnés.
- **KRD :** réutilise/étend S92 ; OTel JS SDK (ADR 0040).

## DP18 — Fragments substrat : git (Forgejo) + tickets (Plane) + auth (Better-Auth)

**Sous-système :** Generators / Archive
**Objectif :** Émettre les fragments des services applicatifs optionnels : **Forgejo** (git auto-hébergé de l'app émise, profile `git`), **Plane** (tickets de l'app émise, profile `tickets`), **Better-Auth** (auth runtime des utilisateurs *de l'app construite*, profile `core`/`auth` — distinct de l'auth des users AIDOS E3, réutilise le behavior-macro `app-auth` S80).
**Detail :** Better-Auth se câble sur le behavior-macro `app-auth` (S80) qui s'expanse via l'unique `Expand` (S76). Forgejo/Plane sont des services-substrat optionnels (l'app émise peut avoir son propre git/tickets). Réutilise le boilerplate `/data/dockers/boilerplates/better-auth` comme référence de conventions.
**Inputs :** DP14, DP11, S80 (`app-auth` behavior-macro), S76 (`Expand`), `/data/dockers/boilerplates/better-auth`.
**Critères de done :**
- **Miroir (property + fixture) :** Better-Auth émis se câble sur `app-auth` (S80) byte-identique via `Expand` (S76) ; une operation protégée de l'app émise refuse un rôle insuffisant au runtime ; Forgejo/Plane bootent derrière Traefik (healthcheck vert) sous leur profile.
- **Mur :** below-the-line ; l'auth de l'app émise mappe l'AuthorityGraph **du runtime de l'app**, jamais les approbateurs AIDOS.
- **Déterminisme :** fragments émis byte-identiques ; expansion = `Expand` S76 (jamais dupliquée).
- **UI :** route `/substrate` complétée (tous les profiles) ; Playwright e2e — activer le profile git/tickets, voir les services.
- **KRD :** réutilise S80/S76 (anti-duplication) ; séparation auth-app ≠ auth-AIDOS.

---

## EPIC E — La couche CONNECTEURS comme concept KRD de premier rang

## DP19 — SPIKE-gate : modèle de gouvernance des connecteurs (peut tuer la couche)

**Sous-système :** Kernel / Runtime (spike, `/spike`, T0)
**Objectif :** Avant de graver la couche connecteurs, prouver par mesure que sa **gouvernance tient avec le mur EXISTANT** : Connector/Skill/MCP-server comme **sources déclarées**, gouvernés par agentlayer (5 axes : zone/capacité/skill/confinement/hook) + ledger Merkle (GV03), scopes **RO/RW**, **approbation humaine pour le RW**, chaque action **loggée/tracée/auditable**, séparation stricte **interne/externe/AI/cloud**, et l'invariant **AI-never-direct-to-DB**. Sonder un connecteur RO (Postgres-RO) et un RW (Slack) jetables. Verdict = mesure ; no-go (la gouvernance ne tient pas sans nouveau point de confiance unique) → on tue la couche et on documente l'alternative.
**Detail :** Code jetable `/spike`. Réutilise `agentimpl.{ToolAllowed,EgressAllowed,PathAllowed}` (set-membership fail-closed), `agentrun/ledger.go` (Merkle), et une **porte HITL runtime `ConnectorRuntimeApproval`** pour le RW (**PAS `authority.Decide`** — Amendement A2 : l'admetteur de vérité Kernel ne gate jamais un effet runtime). Mesurer : un connecteur RW sans approbation runtime est-il refusé ? l'IA peut-elle atteindre la DB directement (doit être NON, set-membership A3) ? chaque action est-elle dans le ledger ?
**Inputs :** `back/runtime/agentimpl/enforce.go` (5 axes), `back/runtime/agentrun/ledger.go` (GV03 Merkle), `back/kernel/authority/authority.go` (S16), S15 (scope), ADR 0037 (AGT adoption), spec connectors.
**Critères de done :**
- **Miroir (spike, T0) :** fixture jetable — un connecteur RW sans `authority.Decide` approuvé est refusé ; un appel IA→DB direct est refusé (`AI_DIRECT_DB_ACCESS_FORBIDDEN`) ; chaque action de connecteur produit une entrée ledger Merkle vérifiable (`Verify().OK`). Le spike asserte go (gouvernance tient avec le mur existant) ou no-go reproductible.
- **Mur :** zone `/spike` ; réutilise le mur + agentlayer + ledger **existants**, n'en crée aucun nouveau (la couche connecteurs n'AJOUTE que des gardes, §5).
- **Déterminisme :** les 5 enforcers = set-membership pur fail-closed ; verdict = mesure ; jamais LLM-jugé.
- **UI :** route `/connectors-spike` (verdict + matrice scope/approbation/ledger, thémée+bilingue) ; Playwright e2e — voir le verdict.
- **KRD :** ratchet OFF ; AI-never-direct-to-DB est l'invariant load-bearing.

## DP20 — Connector / Skill / MCP-server comme sources déclarées (RO/RW, scopes)

**Sous-système :** Kernel
**Objectif :** Si DP19 est go, graver **Connector**, **Skill**, **MCP-server** comme **sources Kernel content-adressées** (above-the-line), chacune déclarant : `kind` (connector|skill|mcp_server), `classification` ∈ {`internal`, `external`, `ai`, `cloud`} (séparation stricte), `scope` ∈ {`read_only`, `read_write`}, `egress_hosts[]` (allow-list), `data_truth_scope` (S37 si touche des données), et son binding au target (Gmail/Drive/GitHub-Forgejo/Postgres-RO/Snowflake/ERP/CRM/SIRH/Slack…). Réutilise S15 (scope) + S16 (authority).
**Detail :** Ensemble de classifications/scopes **CLOS** (honnêteté). Un connecteur `ai` ne peut JAMAIS porter `egress_hosts` incluant un datastore direct (invariant AI-never-direct-to-DB encodé au niveau source). Content-adressé (S02). Future connectors déclarés comme records, jamais hardcodés.
**Inputs :** DP19 (go), S15 (scope), S16 (authority), S37 (DataTruthScope), `agentlayer.go` (5 axes), spec connectors.
**Critères de done :**
- **Miroir (property ∀ N1) :** un Connector round-trip comme source content-adressée ; classification/scope hors-ensemble-clos refusés (`UNKNOWN_CONNECTOR_CLASS`/`UNKNOWN_CONNECTOR_SCOPE`) ; un connecteur `ai` avec un egress vers un datastore est refusé (`AI_DIRECT_DB_ACCESS_FORBIDDEN`) ; un connecteur RW sans authority déclarée refusé.
- **Mur :** Connector/Skill/MCP-server sont des **vérités above-the-line** — écrites par idée→miroir→/goal→approbation ; l'agent n'a aucun GRANT ; séparation interne/externe/AI/cloud encodée comme contrainte de source.
- **Déterminisme :** validation = fonction pure totale ; miroir de reproductibilité ; AI-never-direct-to-DB = invariant déclaré, jamais inféré.
- **UI :** route `/connectors` (liste des connecteurs déclarés + classification/scope, thémée+bilingue) ; Playwright e2e — voir un connecteur seedé.
- **KRD :** réutilise S15/S16/S37 ; un layer connector sans miroir = monstre.

## DP21 — Enforcement RO/RW + approbation humaine pour le RW (réutilise agentlayer + authority)

**Sous-système :** Runtime
**Objectif :** Enforcer les scopes connecteurs via les **5 axes agentlayer existants** : un connecteur `read_only` ne peut que lire (RW refusé), un connecteur `read_write` exige une **approbation humaine d'EXÉCUTION RUNTIME** (porte HITL `ConnectorRuntimeApproval` below-the-line — **PAS `authority.Decide`**, voir Amendement A2) avant tout effet ; `EgressAllowed` enforce l'allow-list d'hosts ; AI-never-direct-to-DB enforced au runtime comme **set-membership** `egress_hosts(ai) ∩ {endpoints role=datastore} = ∅` (Amendement A3).
**Detail :** Réutilise `agentimpl.{ToolAllowed,EgressAllowed,SkillAllowed}` (set-membership fail-closed) sans les forker. **(A2)** deux portes distinctes : la **DÉCLARATION** du connecteur (source/scope) est above-the-line `propose → ChangeSet → approbation` (renvoie `proposed`, S85/S110) ; l'**EXÉCUTION RW** est une autorisation runtime below-the-line (`ConnectorRuntimeApproval`), jamais l'admetteur de vérité Kernel. Aucun nouveau modèle de permission ; les enforcers existants sont resserrés par scope connecteur.
**Inputs :** DP20, `agentimpl/enforce.go`, `authority.go` (S16), S85/S110 (approbation), S55 (RLS).
**Critères de done :**
- **Miroir (fixture `state→cmd→events` N2) :** un connecteur RO tentant un write est refusé (`CONNECTOR_READ_ONLY`) ; un connecteur RW sans approbation humaine est refusé (`CONNECTOR_RW_NEEDS_APPROVAL`) ; un egress hors allow-list refusé (`EGRESS_NOT_ALLOWED`) ; un connecteur `ai` vers un datastore refusé (`AI_DIRECT_DB_ACCESS_FORBIDDEN`). Property — enforcement = set-membership pur fail-closed.
- **Mur :** RW above-the-line via ChangeSet+approbation ; RO below-the-line (lecture libre dans le scope) ; deux couches (enforcer + RLS S55).
- **Déterminisme :** 5 axes = fonctions pures fail-closed ; jamais LLM ; miroir de reproductibilité.
- **UI :** route `/connectors` étendue (toggle RO/RW, inbox d'approbation RW, thémée+bilingue) ; Playwright e2e — approuver un connecteur RW, voir l'action permise ; refuser, voir le BlockReason.
- **KRD :** réutilise agentlayer/authority (anti-duplication) ; approbation humaine pour RW (load-bearing sécurité).

## DP22 — Audit : chaque action de connecteur loggée/tracée dans le ledger Merkle (GV03)

**Sous-système :** Runtime / Archive
**Objectif :** Chaque action de connecteur (lecture, écriture, egress) produit une **entrée du ledger Merkle (GV03)** tamper-evident — qui/quoi/quand/scope/résultat, chaînée par hash, vérifiable. Réutilise `agentrun/ledger.go` (`Append`/`Verify`/`DecisionBOM`), ne le forke pas.
**Detail :** Le `DecisionBOM` capture les inputs load-bearing (connecteur @version, scope, identité, target, résultat). Toute suppression/réordre/altération change le tip root (`Verify().OK=false`). Tracé aussi via OTel (DP17) pour l'observabilité d'exploitation.
**Inputs :** DP21, `agentrun/ledger.go` (GV03 Merkle), DP17 (OTel), S52 (AgentRun).
**Critères de done :**
- **Miroir (property + fixture) :** chaque action de connecteur produit une entrée ledger vérifiable (`Verify().OK`) ; altérer une entrée passée fait `Verify().OK=false` avec `TamperKind` ; property — le `DecisionBOM` dérive des champs enregistrés (drift-free, pas de claim parallèle).
- **Mur :** le ledger est un artefact d'audit below-the-line ; n'écrit aucune vérité Kernel.
- **Déterminisme :** chaînage par hash (S02), jamais par timestamp ; `Append`/`Verify` purs totaux ; miroir de reproductibilité.
- **UI :** route `/connectors` étendue (timeline d'audit par connecteur + statut `Verify`, thémée+bilingue) ; Playwright e2e — exécuter une action, voir l'entrée ledger, vérifier l'intégrité.
- **KRD :** réutilise GV03 (anti-duplication) ; chaque action auditable (load-bearing).

## DP23 — Infra émise : MCP-Gateway + Connector-Registry + Tool-Registry + Webhook-Gateway

**Sous-système :** Generators / MCP
**Objectif :** Émettre comme **infra de l'app émise** (services-substrat, profile `connectors`) : **MCP-Gateway** (point d'entrée unique des outils MCP de l'app), **Connector-Registry** (registre des connecteurs déclarés), **Tool-Registry** (registre des outils exposés), **Webhook-Gateway** (entrée des webhooks, modélisés comme operations async S73). L'app émise reçoit **ses propres MCP + Skills** (ADR 0040 Déc. 4, additif).
**Detail :** Chaque service est un fragment StackManifest émis byte-stable. Les webhooks entrants → operations async (S73, worker TS via Windmill/NATS DP16). Tout op de l'app émise = un outil MCP via la MCP-Gateway (ADR 0009, plan app émise).
**Inputs :** DP20, DP21, DP22, DP16 (async), S73 (webhooks async), ADR 0009/0040 (MCP app émise).
**Critères de done :**
- **Miroir (property + Pact + Godog) :** fragments MCP-Gateway/Connector-Registry/Tool-Registry/Webhook-Gateway émis byte-identiques ; un webhook entrant déclenche une operation async (worker TS) ; Pact par outil exposé via la MCP-Gateway + provider-verification ; un outil non enregistré au Tool-Registry est refusé (`TOOL_NOT_REGISTERED`).
- **Mur :** infra émise below-the-line ; les MCP de l'app émise sont distincts de ceux d'AIDOS ; aucun GRANT de vérité.
- **Déterminisme :** fragments émis purs ; routage MCP-Gateway pur (zéro LLM) ; miroir de reproductibilité.
- **UI :** route `/connectors` complétée (registres + webhook gateway, thémée+bilingue) ; Playwright e2e — enregistrer un connecteur, voir un webhook traité.
- **KRD :** MCP des deux plans (ADR 0009) ; app émise reçoit ses MCP+Skills (ADR 0040, additif).

## DP24 — Cockpit connecteurs (écran exécutable, RO/RW + approbation + audit)

**Sous-système :** Workbench
**Objectif :** Une route Workbench **exécutable** par projet : déclarer un connecteur (propose→ChangeSet→approbation), basculer RO/RW, approuver une action RW, voir la séparation interne/externe/AI/cloud, lire la timeline d'audit Merkle (DP22), enregistrer un MCP-server/Skill. Thémée ccup, bilingue FR-default.
**Detail :** Réutilise la passerelle S58 + SDK S59. Toute écriture-vérité (déclaration de connecteur, scope RW) = ChangeSet proposé ; les déclencheurs RO d'exécution = below-the-line.
**Inputs :** DP20-DP23, S58/S59 (passerelle+SDK), ADR 0010/0011.
**Critères de done :**
- **Miroir (Playwright e2e) :** déclarer un connecteur (ChangeSet proposé) → approuver → l'exécuter en RO ; basculer en RW → exiger une seconde approbation → l'exécuter → voir l'entrée ledger ; tenter un connecteur `ai`→DB → voir le BlockReason.
- **Mur :** l'écran **propose** un ChangeSet pour toute vérité-connecteur ; ne touche jamais le Kernel directement.
- **Déterminisme :** l'affichage (scopes, audit) = projection pure ; jamais une estimation.
- **UI :** route `/connectors` finalisée, action-capable (pas display-only), thémée+bilingue.
- **KRD :** tout se fait par écran ; aucune capacité connecteur headless.

---

## EPIC F — Preview / Deploy / Domaines-TLS / Environnements+Rollback keyés sur les phases stables

> **Cet épic ÉTEND S94–S99 (app-builder), ne les duplique pas.** Il y branche StackManifest (EPIC A) + Environment (EPIC B) + bootstrap (EPIC C) + substrat (EPIC D). Le déploiement reste une **ré-projection déterministe depuis une phase DAG stable** (jamais un script procédural ; done is computed).

## DP25 — Preview éphémère par profile keyé sur la phase (étend S94)

**Sous-système :** Runtime
**Objectif :** **Étendre S94** : démarrer serveur+datastore+UI émis pour la **phase stable active** à une URL de preview, via le **bootstrap déterministe DP12** avec un **profile sélectionnable** (DP11, ex. core+observability), keyé sur une phase content-adressée, démonté déterministiquement.
**Detail :** Le preview ré-émet depuis la phase (DP05) puis amorce (DP12). Le hash de l'app preview = le hash émis de la phase (réutilise S94). Profile par défaut `core` ; `full` pour un preview complet.
**Inputs :** S94 (preview éphémère — étendu), DP05 (EmitStack), DP12 (bootstrap), DP11 (profiles).
**Critères de done :**
- **Miroir (Godog + Playwright) :** build-green → l'URL de preview sert l'app ; le hash de l'app preview **égale** le hash émis de la phase ; cliquer un bouton émis exécute l'operation liée contre le datastore (via le sidecar interpréteur Go) ; démontage déterministe.
- **Mur :** below-the-line (déclencheur de preview) ; aucune écriture-vérité.
- **Déterminisme :** preview = ré-émission pure depuis la phase + bootstrap déterministe ; miroir de reproductibilité (hash phase = hash preview).
- **UI :** route `/deploy` (onglet preview + sélecteur de profile, thémée+bilingue) ; Playwright e2e — lancer un preview, voir l'URL, cliquer un bouton.
- **KRD :** étend S94 ; phase content-adressée comme clé.

## DP26 — Pipeline de déploiement keyé sur les phases stables (étend S96)

**Sous-système :** Runtime
**Objectif :** **Étendre S96** : action « Déployer cette phase » — permise **uniquement** depuis une phase où (red→vert ∧ vert antérieur intact ∧ mutation ≥ seuil ∧ aucun monstre) (« done is computed »). Le deploy **ré-émet** la stack depuis la phase (DP05) → ordre : network→volumes→**datastore provision (DP15)**→**Atlas expand-contract (S95, DataTruthScope-gated)**→bootstrap ordonné (DP12)→healthchecks→URL (fork datastore-timing → recommandation A). Réutilise S96 ; n'invente aucun nouveau gate de « deploy approval » (hérite le Stop-gate).
**Detail :** L'artefact déployé est un **bundle Node/Bun/edge Hono + sidecar interpréteur Go** (ADR 0040), ré-projeté depuis la phase, jamais un artefact sandbox périmé. Le deploy n'est PAS une écriture-vérité (ré-projette une phase existante).
**Inputs :** S96 (pipeline deploy — étendu), DP05, DP12, DP15, S95 (migration), S23 (phase stable), S86 (calcul de phase).
**Critères de done :**
- **Miroir (fixture + intégration + property) :** déploiement d'une phase non-stable refusé (`PHASE_NOT_STABLE`) ; la migration Atlas tourne forward-only ; property — l'artefact déployé est **ré-projeté depuis la phase**, jamais un artefact sandbox stale (hash artefact = hash phase). La phase DAG est l'unité de déploiement.
- **Mur :** deploy ≠ write-to-kernel (ré-projette) ; il hérite le Stop-gate (pas un gate séparé) ; migration destructive human-gated (DataTruthScope).
- **Déterminisme :** deploy = ré-émission pure (DP05) + bootstrap déterministe (DP12) ; miroir de reproductibilité.
- **UI :** route `/deploy` (action « déployer cette phase » exécutable, thémée+bilingue) ; Playwright e2e — déployer une phase stable, voir l'URL ; tenter une phase non-stable, voir le refus.
- **KRD :** étend S96 ; done is computed ; réutilise S78/S95 (anti-duplication).

## DP27 — Domaines custom + TLS automatique via Traefik (étend S97)

**Sous-système :** Runtime
**Objectif :** **Étendre S97** : binding de domaine custom + certificats TLS (ACME via Traefik, comme le déploiement traefik /data/dockers) + DNS pour l'app déployée, via les labels Traefik émis (DP03 : routeur HTTPS websecure/tls + redirect HTTP→HTTPS + `CERT_RESOLVER_NAME`).
**Detail :** Le domaine se câble dans le StackManifest/Environment (DP06) ; les labels Traefik émis (DP03) le résolvent. Réutilise S97 ; le déploiement traefik (qui OWNS `traefik_default` + publie 80/443) reste l'unique propriétaire du réseau/des ports.
**Inputs :** S97 (domaines/TLS — étendu), DP03 (labels Traefik), DP06 (Environment), `/data/dockers/boilerplates/traefik` (ACME, certresolver).
**Critères de done :**
- **Miroir (fixture + Godog + property) :** un domaine appartient à **exactement un** projet (`DOMAIN_ALREADY_BOUND` sinon) ; un domaine custom sert l'app en HTTPS (TLS via certresolver) ; property — le binding domaine→projet est **injectif**.
- **Mur :** binding domaine = projection below-the-line (déclencheur) ou ChangeSet si vérité d'environnement.
- **Déterminisme :** émission des labels Traefik = pure (DP03) ; binding injectif vérifié par fonction pure.
- **UI :** route `/deploy` étendue (binding domaine + statut TLS, thémée+bilingue) ; Playwright e2e — lier un domaine, voir l'URL HTTPS.
- **KRD :** étend S97 ; réutilise les conventions Traefik /data/dockers.

## DP28 — Environnements + rollback par ré-projection (étend S98)

**Sous-système :** Archive / Runtime
**Objectif :** **Étendre S98** : promotion d'environnements (preview→staging→prod) et **rollback = checkout d'une phase DAG stable antérieure** qui **ré-projette déterministiquement** l'app (DP05/S78) + réconcilie le datastore (Atlas migration inverse expand-contract ; Doltgres `as-of` si opt-in non-prod). Le truth-store/phase est autoritatif ; le code sandbox n'est **jamais restauré tel quel** (CLAUDE.md §9). Non destructif, append-only, décision enregistrée.
**Detail :** Rollback = nouvelle phase sélectionnée → ré-émission (DP05) → Atlas forward/inverse → restart bootstrap (DP12) (fork datastore-timing → A). La production devient une cible de senseur (E12).
**Inputs :** S98 (environnements/rollback — étendu), DP05, DP12, DP15, S95 (migration inverse), S24 (DAG).
**Critères de done :**
- **Miroir (Godog) :** promouvoir N en prod → incident → rollback à N-1 → prod sert **l'app ré-émise depuis N-1** avec le vert antérieur intact, l'action provenancée, **rien supprimé ni restauré comme artefact stale**. Property — l'artefact post-rollback = ré-projection de N-1 (hash égal), jamais un artefact sandbox.
- **Mur :** rollback ≠ write-to-kernel (ré-projette une phase antérieure) ; décision enregistrée (ChangeSet + provenance).
- **Déterminisme :** rollback = ré-émission pure depuis la phase antérieure ; réconciliation datastore reproductible ; miroir de reproductibilité.
- **UI :** route `/deploy` étendue (promotion d'env + rollback exécutable, thémée+bilingue) ; Playwright e2e — promouvoir, rollback, voir l'app ré-émise.
- **KRD :** étend S98 ; ré-projection, jamais checkout d'artefact ; append-only §9.

## DP29 — Cockpit déploiement & environnements (écran exécutable, étend S99)

**Sous-système :** Workbench
**Objectif :** **Étendre S99** : panel par projet montrant phases (liveness vert/rouge/inconnu), environnements (preview/staging/prod/future_cloud switchables), domaines/TLS, profiles, actions deploy/rollback **exécutables** (pas display-only), URL live, et timeline d'incident/rollback (audit). Toute action = ChangeSet (vérité d'infra) ou below-the-line (déclencheur preview/staging).
**Detail :** Réutilise la passerelle S58 + SDK S59 + le calcul de phase S86. Thémée ccup, bilingue FR-default.
**Inputs :** S99 (cockpit deploy — étendu), DP25-DP28, S58/S59/S86.
**Critères de done :**
- **Miroir (Playwright e2e) :** déployer une phase (requiert phase verte + approbation DataTruthScope), lier un domaine, voir l'URL HTTPS, rollback à une phase antérieure, voir l'historique d'audit ; une action sur phase non-stable refusée (`PHASE_NOT_STABLE`).
- **Mur :** l'écran propose un ChangeSet pour les vérités d'infra (idée→miroir→/goal→approbation) ; below-the-line pour preview/staging.
- **Déterminisme :** phases/liveness affichées = projection pure du DAG.
- **UI :** route `/deploy` finalisée, action-capable, thémée+bilingue.
- **KRD :** étend S99 ; tout se fait par écran ; aucune deploy API headless séparée.

---

## EPIC G — Docs par app, backup, secrets par projet, portabilité future-cloud

## DP30 — Docs par app émise : Fumadocs + Scalar + Pagefind (profile docs)

**Sous-système :** Generators
**Objectif :** Émettre déterministiquement les **docs de l'app construite** (profile `docs`) : **Fumadocs** (site de doc), **Scalar** (référence API depuis l'OpenAPI émis S90), **Pagefind** (recherche statique) — depuis le Kernel + l'OpenAPI per-app, byte-stable. Distinct des docs Mintlify d'AIDOS (le build journal).
**Detail :** Scalar consomme l'OpenAPI émis (S90) ; Fumadocs rend les concepts du domaine du user ; Pagefind indexe statiquement. Fragments StackManifest émis. Thème ccup hérité (ADR 0010), i18n bilingue (ADR 0011).
**Inputs :** DP11 (profile docs), S90 (OpenAPI émis), DP14 (palette), spec stack-2026.
**Critères de done :**
- **Miroir (property + Godog) :** docs émises byte-identiques depuis le Kernel+OpenAPI ; Scalar rend l'OpenAPI émis (chaque endpoint présent) ; Pagefind indexe et trouve ; property — même Kernel → mêmes docs.
- **Mur :** below-the-line ; les docs sont une projection, jamais une vérité.
- **Déterminisme :** émission docs = fonction pure du Kernel+OpenAPI ; miroir de reproductibilité.
- **UI :** route `/app-docs` (preview des docs émises de l'app, thémée+bilingue) ; Playwright e2e — voir les docs + la référence API Scalar.
- **KRD :** docs par app ≠ docs AIDOS Mintlify ; thème/i18n hérités.

## DP31 — Stratégie de backup des volumes/datastore (append-only, non destructif)

**Sous-système :** Runtime / Archive
**Objectif :** Émettre + provisionner une stratégie de backup déterministe des **volumes nommés bind** (`${APP_DATA_PATH}`) et du **datastore** (dump Postgres / snapshot Doltgres non-prod), planifiée via Windmill (DP16), append-only, scopée `project_id`. Les backups ne contiennent jamais de secrets en clair (réutilise S91).
**Detail :** Backup = job async (worker TS S74 via Windmill) ; cible de stockage objet (réutilise le provider S72) ou volume dédié. Restauration = décision enregistrée (append-only). Distinct du rollback-par-phase (DP28) : le backup protège la DONNÉE, le rollback ré-émet le CODE.
**Inputs :** DP15 (datastore), DP16 (Windmill jobs), S72 (stockage objet), S91 (secrets).
**Critères de done :**
- **Miroir (fixture `state→cmd→events` N2) :** un backup planifié s'exécute (horloge injectée) et produit un artefact restaurable ; une restauration round-trip la donnée sans perte ; property — le backup ne contient aucun secret en clair (scan déterministe type-gitleaks) ; isolation par projet (backup de A inaccessible depuis B).
- **Mur :** below-the-line ; secrets jamais dans le backup en clair (S91).
- **Déterminisme :** planification = code (horloge injectée), jamais LLM ; sélection de données = requête déterministe scopée ; miroir de reproductibilité.
- **UI :** route `/app-ops` (backups : planifier, lister, restaurer — exécutable, thémée+bilingue) ; Playwright e2e — planifier un backup, voir l'artefact.
- **KRD :** append-only §9 ; réutilise S72/S91/Windmill DP16.

## DP32 — Per-project secret store (réutilise S91 — chiffré, jamais dans truth-store/git/source)

**Sous-système :** Runtime / Generators
**Objectif :** **Brancher S91** sur le provisioning : le secret store par projet (credentials DB, clés API connecteurs, secrets OAuth, certificats) — **chiffré au repos, scopé `project_id`, jamais dans le truth-store, jamais dans git, jamais dans le source émis** — alimente le `.env` concret au bootstrap (DP12) par variables d'env, avec rotation. Le `.env.example` émis (DP04) ne porte que des **références**.
**Detail :** Réutilise S91 intégralement (ne le duplique pas). Ordre de merge au boot : `.env.example` (références) → secret store (valeurs) → overrides d'environnement. Rotation = nouvelle valeur + restart (append-only, décision enregistrée). Scan gitleaks déterministe sur l'émission.
**Inputs :** S91 (secret store — réutilisé), DP04 (.env.example), DP12 (bootstrap), DP07 (managed_url).
**Critères de done :**
- **Miroir (property + fixture) :** un secret du projet A ne fuite jamais vers B ni n'apparaît dans le source émis (scan déterministe type-gitleaks → vert) ; rotation invalide l'ancien secret ; un secret manquant au boot lève `MISSING_SECRET_AT_BOOT` (actionnable) ; le `.env.example` émis ne contient que des références (zéro valeur).
- **Mur :** secrets vivent dans l'appliance/secret store au boot, jamais dans truth-store/git/source émis ; below-the-line ; RLS + project_id (S55) empêche la fuite cross-projet.
- **Déterminisme :** scan = code (gitleaks), jamais LLM ; ordre de merge = fonction pure gravée ; miroir de reproductibilité.
- **UI :** route `/app-ops` étendue (secrets : ajouter une référence, faire tourner — jamais afficher la valeur ; thémée+bilingue) ; Playwright e2e — ajouter un secret, voir la référence (pas la valeur), faire tourner.
- **KRD :** réutilise S91 (anti-duplication) ; secrets jamais dans la vérité ni le source.

## DP33 — Portabilité future-cloud : le StackManifest comme unique source, le cloud comme projection

**Sous-système :** Generators / Runtime
**Objectif :** Prouver que le **même StackManifest** (EPIC A) se projette vers `future_cloud` (DP06) **sans réécrire la déclaration** : un Target additif (ou un mode de projection) émet une cible cloud (compose→manifeste cloud / `managed_url` pour les services managés) déterministiquement. Le self-hosted et le cloud sont deux **projections de la même source** ; aucune divergence de déclaration.
**Detail :** Le `future_cloud` environment (DP06) résout les services en `managed_url` (DP07) là où c'est pertinent (datastore→RDS-like, bus→managed). L'émetteur cloud est additif (matrice kind×target close). Aucune dépendance à la structure de fichiers /data/dockers (fork deploy.sh → B : outil séparé). Pas de Coolify (contrainte dure) : l'orchestration reste le bootstrap déterministe ou une cible cloud déclarée.
**Inputs :** DP02 (StackManifest), DP06 (future_cloud), DP07 (managed_url), DP05 (EmitStack), spec future-cloud portability.
**Critères de done :**
- **Miroir (property ∀ N1) :** le même StackManifest émet vers self-hosted ET future_cloud **déterministiquement** (chaque cible byte-identique, sans modifier la source) ; un service managé en `future_cloud` se résout en `managed_url` ; property — la déclaration (source) est invariante entre cibles (zéro divergence).
- **Mur :** le StackManifest reste l'unique source above-the-line ; les cibles sont des projections below-the-line.
- **Déterminisme :** projection cloud = fonction pure du même manifest ; miroir de reproductibilité (parité self-hosted/cloud au niveau source).
- **UI :** route `/deploy` étendue (cible self-hosted vs future_cloud, thémée+bilingue) ; Playwright e2e — basculer la cible, voir la projection recalculée depuis la même source.
- **KRD :** une source → N projections (jamais double-déclaré) ; pas de Coolify ; portabilité par projection, jamais par réécriture.

---

## Note de dépendances (l'ordre que `/long-run` doit respecter)

1. **EPIC A est la fondation** : le StackManifest doit exister avant tout (bootstrap, environnements, connecteurs, deploy n'ont de sens qu'avec la stack déclarée). **DP01 (spike-gate) → DP02 → DP03 → DP04 → DP05** en séquence stricte. Si DP01 est no-go, la roadmap s'arrête.
2. **EPIC B (environnements + modes de connexion)** débloque le bootstrap et le deploy ; **DP06 → DP07 → DP08 → DP09**. DP08 (EMITTED_NO_HARDCODED_ENDPOINT) est gravé tôt car tous les fragments émis (EPIC D) doivent le respecter.
3. **EPIC C (bootstrap)** : **DP10 (spike-gate) → DP11 (profiles) → DP12 (bootstrap one-shot) → DP13 (MCP)**. DP11 (profiles) précède EPIC D (les fragments substrat portent un profile).
4. **EPIC D (substrat)** dépend de DP11 (profiles) + DP07 (modes de connexion) : **DP14 (spike-gate palette) → DP15 (datastore, réutilise S88/S89/S95) → DP16 (Windmill/NATS, réutilise S73/S74) → DP17 (obs, étend S92) → DP18 (git/tickets/auth, réutilise S80/S76)**.
5. **EPIC E (connecteurs)** dépend du mur+agentlayer+ledger existants (S15/S16/S37/GV03) : **DP19 (spike-gate gouvernance) → DP20 (sources) → DP21 (enforcement RO/RW) → DP22 (audit Merkle) → DP23 (infra émise) → DP24 (cockpit)**. DP19 peut tuer la couche.
6. **EPIC F (deploy)** ÉTEND S94–S99 et dépend de EPIC A+B+C+D : **DP25 (preview, étend S94) → DP26 (deploy, étend S96) → DP27 (domaines, étend S97) → DP28 (rollback, étend S98) → DP29 (cockpit, étend S99)**. DP26 réutilise S78 (ré-projection), S95 (migration), S86 (calcul de phase).
7. **EPIC G** dépend de EPIC F (deploy en place) : **DP30 (docs) → DP31 (backup) → DP32 (secrets, réutilise S91) → DP33 (future-cloud)**. DP32 (secret store) est forward-référencé par DP12 (bootstrap merge env) — **forward-dependency par design, OpenQuestion documentée, ne bloque pas** : DP12 mocke le secret store (S91 existe déjà) jusqu'à DP32 qui le branche pleinement.

**OpenQuestions à griller avant exécution (`/grill-with-docs`) :**
- **(EPIC A)** StackManifest = record kind de premier rang (recommandé) vs dimension du TruthScope S15 ? — tranché par le spike DP01.
- **(Fork Next vs Hono)** la couche d'app reste-t-elle Hono (ADR 0040, recommandé) ou un nouvel ADR autorise-t-il Next+next-intl ? — décision humaine au-dessus du mur, **jamais résolue silencieusement** ; ouvrir l'ADR avant DP05 si Next est requis.
- **(EPIC C)** bootstrap déterministe natif (recommandé) vs réutilisation directe de deploy.sh ? — tranché par le spike DP10.
- **(EPIC D)** palette substrat open-source-stack-2026 confirmée (Windmill not Temporal, Postgres prod / Doltgres non-prod, pas de Coolify, Drizzle non imposé) ? — tranché par le spike DP14.
- **(EPIC E)** la gouvernance des connecteurs tient-elle avec le mur existant (AI-never-direct-to-DB, RW human-gated, audit Merkle) ? — tranché par le spike DP19, peut tuer la couche.

---

## Ce qui change vs aujourd'hui (honnête)

| Aujourd'hui (S00–S117 app-builder) | Après cette feuille (DP01–DP33) |
|---|---|
| L'app émise = fichiers source ; le deploy (S94–S99) est keyé sur les phases mais **sans déclaration de stack ni d'environnement**. | **StackManifest** content-adressé (source above-the-line) → émetteur déterministe → **compose+.env+scripts byte-identiques** (contrat /data/dockers reproduit) ; **modèle d'environnements** + **modes de connexion** (zéro endpoint hardcodé). |
| Pas de bootstrap déterministe ; le seul mécanisme connu (deploy.sh) est **interactif** (select/sed/humain). | **Bootstrap one-shot déterministe** (réseaux/volumes/.env/secrets-check/ports/start-ordonné/healthchecks/print-URLs) + **compose profiles** (core/docs/observability/qa/git/tickets/connectors/non-prod/full) ; deploy.sh reste un outil self-hosted séparé. |
| Aucun substrat provisionnable par app ; observabilité (S92) modélisée. | **Services-substrat par profile** : Postgres/Valkey/PgBouncer (core), **Windmill** (not Temporal)/NATS, OTel/SigNoz/GlitchTip, Forgejo/Plane/Better-Auth, Fumadocs/Scalar/Pagefind ; **Doltgres NON-PROD seulement** (spike S88). |
| Aucun concept de connecteur ; pas de gouvernance des accès externes. | **Couche connecteurs de premier rang** : Connector/Skill/MCP-server comme sources déclarées, **RO/RW + approbation humaine RW + audit Merkle (GV03)**, séparation interne/externe/AI/cloud, **AI-never-direct-to-DB** ; **MCP-Gateway/Connector-Registry/Tool-Registry/Webhook-Gateway** émis. |
| Deploy/rollback (S94–S99) keyés sur phases mais sans stack/env/substrat branchés. | **Preview/deploy/domaines-TLS/rollback ÉTENDENT S94–S99** avec StackManifest+Environment+bootstrap+substrat ; deploy = **ré-projection depuis la phase** ; rollback = **ré-projection d'une phase antérieure** (jamais artefact stale). |
| Pas de docs par app, pas de backup, secrets (S91) non branchés au provisioning. | **Docs par app** (Fumadocs/Scalar/Pagefind émis) + **backup append-only** des volumes/datastore + **secret store par projet branché** (S91, jamais dans truth-store/git/source) + **portabilité future-cloud** (le manifest = unique source, le cloud = projection). |

**Le cœur déterministe (émetteurs, mur hook+GRANTs, miroirs/complétude, content-store S02, ledger Merkle GV03, TruthScope S15, AuthorityGraph S16, AgentLayer 5-axes, S78 ré-projection, S88/S89 datastore, S91 secrets, S95 migration) n'est PAS reconstruit — il est réutilisé tel quel.** Tout ajout est **additif** (anti-overwrite §9). **Nouveaux ADR attendus :** StackManifest-as-source (DP01 verdict), Target docker-compose émis (DP03), modèle d'environnements + modes de connexion (DP06/DP07), bootstrap déterministe vs deploy.sh (DP10), palette substrat open-source-stack-2026 (DP14), couche connecteurs + gouvernance (DP19/DP20), provider de stockage objet pour backup (DP31), portabilité future-cloud (DP33). **Le fork Next-vs-Hono n'est jamais résolu silencieusement** : il reste une décision humaine au-dessus du mur (ADR 0040 acté = Hono ; un Next exige un nouvel ADR amendant 0040).

---

## Annexe 1 — Impact sur l'EXISTANT (S00–S52 + EL + 5 outils + ADRs)

> Synthèse : la piste DP est **quasi entièrement additive et parallèle**. Une nouvelle SOURCE Kernel content-adressée (`StackManifest`), de nouveaux targets d'émetteur (`TargetComposeManifest`, env-projection), un invariant arch-fitness (`EMITTED_NO_HARDCODED_ENDPOINT`), une couche connecteurs — tous se branchent sur la machinerie EXISTANTE (ensembles clos + content-addressing `records.Hash`/`Canonicalize`, le triptyque gouvernance `agentlayer`/`agentimpl`/`agentrun.ledger`, `generators.targetOrder`, la famille arch-fitness `emitted_target` de FN). **Le seul changement non-trivial est l'élargissement de `scope.Environment`** (cf. A6 + les risques ci-dessous). Aucun renumérotage Sxx, aucune réécriture (anti-overwrite §9).

| Cible existante | Kind | Changement concret |
|---|---|---|
| `back/runtime/generators/generators.go` | extend | ajouter `TargetComposeManifest` + un target env-projection au `const` clos et à `targetOrder` (≈ l.65) — la discipline « grows ONLY additively » (l.48) ; `Targets()`/`isKnownTarget` les prennent gratis. Ajouter `KindStackManifest` à côté de `KindEntity` (l.88) + un décodeur `StackManifestSource` (patron `EntitySource`, OQ-S34). Contrat d'émission byte-stable réutilise le contrat déterministe verbatim (`Emit` pur de `Canonicalize`, header protégé, `SourceHash`/`OutputHash`, l.109-120). `TargetPgDDL`/`TargetTSTypes` **inchangés**. |
| `back/runtime/agentloop/arch-fitness.json` + `archfitness.go` | extend | ajouter `EMITTED_NO_HARDCODED_ENDPOINT` à `emitted_target.functional_invariants` (l.17-21/40-44) à côté de `EMITTED_NO_GLOBAL_MUTABLE`/`_FUNCTION_PURE`/`_CALL_GRAPH_ACYCLIC` ; le test de parité JSON↔Go (`EmittedInvariantCodes()`) ajoute le code. Règle sœur de `CheckLLMIsolation` : scan pur sur `back/gen` (set-membership contre les endpoints `role=datastore` du StackManifest), fail-closed, fault-injection (littéral injecté → rouge). |
| `back/kernel/agentlayer/agentlayer.go` | extend | `CoucheAgent` est le patron pour `Connector`/`Skill`/`MCP-server` comme sources déclarées ; scopes RO/RW mappent `MCPBinding` + `ZonesLecture/Ecriture` + confinement BA09 (`AllowedNetworkHosts`/`AllowedExec`). Nouveau `LayerKind` connecteur **additif** à `layerKindOrder` (l.39-46) — OU connecteur porté comme `MCPBinding` (fork ADR). |
| `back/runtime/agentimpl/enforce.go` | extend | RO/RW réutilise `ToolAllowed`/`EgressAllowed`/`ExecAllowed` (fail-closed verbatim). AI-never-direct-to-DB = forme `EgressAllowed`/`coveredBy` (set-membership l.127-180, deny-set d'endpoints datastore). **NOUVELLE porte** : approbation humaine d'**exécution RW runtime** (≠ écriture de vérité ; **PAS `authority.Decide`** — A2) = nouveau BlockReason + record d'approbation + champ BOM. |
| `back/runtime/agentrun/ledger.go` | extend | « chaque action auditée » réutilise le ledger Merkle direct : chaque action RW connecteur = un `LedgerEntry` (BOM étendu connecteur+scope+approbation), chaîné `prior_root` → suppression/réordre = rouge sur `Verify`. Pas de fork. |
| `back/kernel/scope/scope.go` | **supersede via version (RISQUE)** | élargir `Environment` `{prod,staging,dev}` → +`local`+`future_cloud` = vrai changement de vérité au-dessus du mur. Blast radius (tout dans `back/kernel/scope/`) : const (l.113-117), `environmentOrder` (l.119), message `ValidateShape` (l.284 `want prod\|staging\|dev`), **`scope_property_test.go:209-210` asserte `len==3` → flip 5**, `migration_roundtrip_test.go` inchangé. **Pas de migration DDL** (scope stocké en JSONB freeform, aucun CHECK). idée→miroir→/goal + `SemanticDiff add`. |
| `back/kernel/records/records.go` | extend / **fork** | `StackManifest` nouveau record kind : touche `Kind` const, `Kinds()` (l.31-39/55-57), `defaultAuthority` (l.63-71), `isKnownKind`, property/migration tests + **entrée `mirrors` + back-fill complétude** (toute vérité a un miroir vivant). **Alternative basse-blast-radius : modéliser StackManifest en `kind:layer`** (comme `CoucheAgent`) → zéro touche à l'ensemble des 7 kinds. **Fork ADR explicite.** |
| `docs/plan/ROADMAP-compound-requirements.md` + `back/runtime/besoin/` | extend | l'interview besoin doit élire les besoins déploiement/connecteurs : **nouvelle BANDE transversale** (comme `invariant`/`policy` en EL02/EL14), pas un nouveau rung vertical (l'ordre §23 `product→…→entity` est total clos). `LevelToProposes` (ADR 0041) gagne un mapping (probablement `NoEmit` vers Ideas, mais sème les ancres StackManifest/Connector) ; `besoin-intake` (EL15) gagne `besoin_capture_deployment`/`_connector`. Steps EL-style parallèles, **pas** de renumérotage EL00–EL19. |
| `front/web/components/WorkbenchHeader.tsx` | extend | routes ajoutées au `GROUPS` : `/stack-manifest`+`/environments` (groupe `kernel`), `/connectors` (`kernel` ou nouveau groupe `deploy`), `/deploy-cockpit` (groupe `build` près de `/web-preview`). Chacune : entrées `fr/en.json` nav+navGroups + route + e2e (patron EL15 `/besoin-intake`). Additif. |
| `back/mcp/` | new-step | `back/mcp/deploy-infrastructure/` (bootstrap, profiles, preview/deploy/rollback keyés phase, domaines/TLS) + `back/mcp/connectors/` (déclarer/lister, RO call, demande approbation RW, lire ledger). Tout op = un outil (ADR 0009). Patrons `mcp/dag`+`mcp/changeset`. |
| ADR 0006 / ADR 0040 | neutral | datastore reste Postgres-dialecte (Doltgres opt-in, Atlas inchangé) ; Décision 7 (sidecar interpréteur Go) ⇒ l'émetteur StackManifest **inclut** le service-interpréteur comme service substrat déclaré. |

**Nouveaux ADR (impact existant) :** (1) **table frozen-stack SÉPARÉE** pour le substrat de déploiement de l'app émise (Postgres/Valkey/PgBouncer/Windmill/NATS/OTel/SigNoz/GlitchTip/Forgejo/Plane/Better-Auth/Fumadocs/Scalar/Pagefind) — ADR 0003 n'a aucun slot pour ça, amende-par-référence 0003/0040 comme EL00 l'a fait ; (2) couche connecteurs gouvernée (porte d'exécution RW runtime **hors `authority.Decide`**) ; (3) modèle de provisioning déterministe / emit-output-contract ; (4) **addendum à 0006** « Doltgres non-prod uniquement » (résout l'OPEN QUESTION défaut-vs-opt-in de 0006, couplé à l'élargissement scope) ; (5) **StackManifest record-kind vs `kind:layer`** (fork de blast-radius).

**3 points réellement non-triviaux / porteurs de risque :**
1. **Élargir `scope.Environment`** — seul item non purement additif (édite un enum clos asserté en aval : `scope_property_test.go:209-210` flip 3→5). Doit passer idée→miroir→/goal en `SemanticDiff add`, **couplé** à l'addendum 0006 (ils atterrissent ensemble).
2. **Porte d'approbation RW runtime des connecteurs, hors `authority.Decide`** — surface d'enforcement **nouvelle** (nouveau BlockReason + record d'approbation + champ BOM), même si elle réutilise la *forme* fail-closed d'`enforce.go` et le ledger Merkle.
3. **Byte-stabilité du contrat d'émission** face aux conventions /data/dockers réelles (syntaxe labels Traefik, nommage volumes, réseau partagé) **externes au Kernel** — risque de gap de déterminisme si l'ordre d'émission services/labels/volumes fuit ; conventions à **épingler comme contrat de sortie versionné** dans l'ADR de provisioning. Greenfield confirmé (aucun émetteur compose/traefik existant dans `back/`).

---

## Annexe 2 — Impact sur l'APP-BUILDER (S53–S117)

> Synthèse : DP est une **couche de CONCRÉTISATION** par-dessus E9 (S87–S93) et E10 (S94–S99) — **ni supersession, ni réordre**. L'app-builder a délibérément écrit ces steps **agnostiques du mécanisme d'infra** ; ADR 0040 a déjà basculé leur cible d'émission Go→Hono/TS (appendice l.273-299). DP comble le reste : il fait des conventions /data/dockers le **contrat de sortie d'émission déterministe** (reuse-don't-reinvent ADR 0007) reproduit **dans S87** comme nouveau target clos `TargetComposeManifest`, et épingle la topologie (Hono + sidecar interpréteur Go + datastore) + le deploy-comme-ré-projection-depuis-la-phase.

| Step app-builder | Kind | Concrétisation DP |
|---|---|---|
| **S87** (scaffold serveur émis) | extend | DP y loge l'**émetteur compose** (`TargetComposeManifest` ajouté **additivement** à `targetOrder`, byte-stable, ProtectedMarker+sourceHash) reproduisant /data/dockers (container_name, env_file, labels Traefik, volume bind, healthcheck, restart). Entrypoint = `serve()` Hono (post-0040), pas un binaire Go. |
| **S88** (spike Doltgres) | neutral | inchangé (déjà spike-gaté, plain-Postgres défaut). DP **consomme** le verdict (quel bloc datastore émettre). S88 précède S89. |
| **S89** (provisioning datastore) | extend | DP rend l'acte concret : datastore = service du compose émis ; **timing résolu = au DEPLOY** (pre-deploy : émettre DDL en S87/S89, appliquer Atlas + provisionner avant start en S96), pas paresseux. Atlas+dialecte gelés. |
| **S90** (API émise + callback interpréteur) | extend | Décision 7 (ADR 0040) devient un **fait de topologie** : le bundle déployé embarque un **sidecar interpréteur Go** (versionné avec le Kernel, IPC local) ⇒ le compose S87 inclut **deux services** (app Hono + sidecar) + datastore. |
| **S91** (secrets) | extend | injection concrète : secrets peuplent le `.env` fusionné **au deploy** (ordre /data/dockers global→bp-default→bp-secrets→overrides), chmod 600, hors git. « Secrets Contract ». |
| **S92** (observabilité expl.) | neutral | inchangé au-delà du pivot OTel JS (0040) ; DP ajoute juste la config collecteur/endpoint au compose émis. |
| **S93** (front émis) | neutral | orthogonal (décision front Hono JSX/SSR vs hc, OQ-0040-front) ; DP touche serveur/datastore/ops, pas la forme du front. |
| **S94** (preview éphémère) | extend | 1er consommateur du compose : `docker compose up` du manifest émis pour la phase stable, keyé hash, démonté déterministe. |
| **S95** (migration breaking) | neutral | Atlas expand-contract + DataTruthScope gelés ; DP consomme S95 comme étape « apply migration » du pipeline. |
| **S96** (pipeline deploy) | extend | exécuteur « Phase-as-Unit » : (1) ré-projeter phase→compose+code+.env, (2) provisionner datastore, (3) Atlas, (4) start app+sidecar. **Deploy = ré-projection, jamais un deploy.sh procédural dans le produit** ; hérite le Stop-gate (§8). |
| **S97 / S98 / S99** (domaines/TLS, rollback, cockpit) | neutral | aucun delta (0040 l.296). DP fournit la surface (labels Traefik, statut compose/sidecar/datastore dans le cockpit) sans nouveau step. |

**Relation des espaces d'id (recommandation) :** garder **DP comme piste PARALLÈLE RÉFÉRENCÉE** (ids `DPxx` stables ancrés sur un `Sxx` : « DPxx concrétise S87 »), **jamais** de renumérotage Sxx (casserait les agents `step-sNN` + le câblage `PLAN.md` créés en S52.5 — anti-overwrite §9). **Ne pas fondre** ; ajouter un **appendice de renvoi `DPxx→Sxx`** dans `ROADMAP-app-builder.md`, sur le patron de l'appendice « Impacts — ADR 0040 ». Seule la **couche connecteurs** (capacité réellement nouvelle) a son propre slot — dépend de la passerelle S58 (E2) + GV (S15 scope + S16 authority) ; dépendance **vers l'arrière** (fondations déjà bâties), ne perturbe pas l'ordre.

**3 nouveaux ADR (impact app-builder)** = identiques aux ADR de l'Annexe 1 (contrat de sortie/compose target ; topologie runtime émise sidecar+datastore ; couche connecteurs).