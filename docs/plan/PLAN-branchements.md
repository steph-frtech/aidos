# PLAN — ADR manquants + branchements manquants (issu de l'audit « pas branché », 2026-06-15)

> **But.** Graver les décisions (ADR) puis brancher ce qui ment. Issu de l'audit `w91305w3q` (5 finders, ~40 items). Le pattern racine : le moteur Go compile+teste mais le Workbench ne l'appelle pas (twins TS + transcripts fichiers) ; l'émission/déploiement, eux, SONT Go. La décision-mère (0072) désambiguïse tout le reste.

## L'architecture cible (le modèle clair de l'utilisateur)

| | Front | Backend | Vérité |
|---|---|---|---|
| **Workbench** (le cockpit AIDOS) | Next/React | **Go + Postgres** | kernel/mirrors en **Postgres**, écrits par le Go à travers le mur |
| **App générée** (la visée) | React/Expo/Electron | **Hono** (TS) | sa donnée à elle |

Le front Next **appelle** le moteur Go (gateway/MCP) pour les opérations de vérité ; les **twins TS = aperçu/fallback gouverné** (byte-égaux au Go, prouvés par miroir). Seul le **généré** est Hono.

### La pile GÉNÉRÉE (la visée) — substrat gelé COMPLET, vraiment câblé
Décision utilisateur (2026-06-15) : toute app générée embarque, **par défaut dans ses specs**, le substrat gelé **entier et RÉELLEMENT utilisé** (pas déclaré-non-utilisé) :
- **Hono** (backend TS) · **React/Expo/Electron** (les 3 enfants)
- **Doltgres** hors-prod / **Postgres** prod (ADR 0006) — le git-for-data
- **Windmill** (workflows, jamais Temporal) · **NATS** (bus) · **Valkey** (cache)
- **OpenTelemetry → Postgres** (telemetry persistée, plus stdout perdu)
- **Better-Auth** (session) · **docs** (Fumadocs/Scalar) · **connecteurs** (MCP gateway)
C'est l'objet des ADR **0076** (substrat utilisé) + **0080** (Doltgres réel, fini l'URL fictive) ci-dessous — promus en exigence de première classe.

---

## A. LE BACKLOG D'ADR (à graver, 0072→0081 + 2 à finaliser)

### ADR 0072 — Workbench = front Next + backend Go/Postgres ; généré = Hono **[DÉCISION-MÈRE]**
- **Décision.** Le backend du Workbench EST Go + Postgres (la vérité vit en Postgres, écrite par le Go via le mur). Le front Next APPELLE le moteur (via la gateway/MCP) pour toute op de vérité. Les twins TS = **aperçu/fallback gouverné** : byte-égaux au Go (miroir différentiel), utilisés seulement quand le moteur est injoignable, jamais comme source de vérité. L'app générée = Hono (réaffirme ADR 0040). Précise Mandat B (« la vérité vit en Postgres ») : ce n'est PAS qu'une discipline de build, c'est la persistance runtime.
- **Gouverne.** Tout le reste (la couture front↔Go, le truth-store, le statut des twins).
- **Sévérité.** Décision-mère.

### ADR 0073 — Le truth-store Postgres devient la vérité LIVE (S17/S31)
- **Décision.** Les schémas kernel/mirrors/ideas/changesets/dag/brain/context deviennent la vérité live ; le transcript v3 (`.aidos-projects`) devient une **projection** de Postgres (ou y est persisté), plus la source. La forward-dependency S17/S31 (projection kernel) est levée.
- **Branche.** `back/archive/*` (store/changeset/dag) + `back/kernel/*` (ideas/operation projection) reliés au chemin Workbench ; `front/web/app/v3/projects-actions.ts` écrit/lit via le moteur, plus les fichiers.

### ADR 0074 — La gateway MCP HTTP = la couture front↔Go
- **Décision.** Lancer `back/mcp/gateway` en HTTP (`AIDOS_GATEWAY_HTTP_ADDR=:8787`) à côté de `next start` ; exporter `AIDOS_GATEWAY_HTTP_URL` au runtime Next ; enregistrer la flotte Go (`store, changeset, dag, idea-intake, mirror-runner, memory, context, …`) dans `.mcp.json`/la registry ; un **e2e échoue si un écran retombe silencieusement en twin**.
- **Branche.** `.mcp.json` (0 serveur Go aujourd'hui), `front/web/app/bootstrap/mcp.ts` (`callGateway`), env Next, `back/runtime/gateway/registry.go`.
- **Sévérité.** high (débloque les ~90 MCP + tout `runtime/`/`kernel/`).

### ADR 0075 — Les hooks du harness tirent vraiment (le mur build-agent + le done-criterion)
- **Décision.** Câbler dans `.claude/settings.json` : **PreToolUse** (le mur §2 niveau 1 — refuse les écritures kernel/mirrors/fitness), **Stop** (goal-check + completeness + mutation — « done » calculé §8), **SessionStart** (self-test méta-méta S39), **PostToolUse** (sensor-runner par diff). Chacun via un shim stdin→binaire Go, avec fault-injection bout-en-bout (cassé → bloque vraiment).
- **Branche.** `.claude/settings.json` (aujourd'hui : seulement PostToolUse=`e2e-changed-spec.sh` + Stop=`audit.sh`), les binaires `back/hooks/{pretooluse,stop,sessionstart,posttooluse}`.
- **Sévérité.** high — protège l'agent qui CONSTRUIT AIDOS ; orthogonal au choix runtime.

### ADR 0076 — La pile GÉNÉRÉE embarque + UTILISE le substrat gelé COMPLET [exigence 1re classe]
- **Décision.** Toute app générée = **Hono + Doltgres(hors-prod)/Postgres(prod) + Windmill + OTel + NATS + Valkey + Better-Auth + docs + connecteurs**, chaque service **réellement utilisé** (pas seulement déclaré/env-présent), OU explicitement déclassé level-3 pour que l'écran cesse de mentir. Émis **par défaut dans les specs** du projet.
  - **OTel→Postgres** : exporter persistant `telemetry.span` (sidecar OTLP→pgx INSERT append-only ; `debug` en dev). Aujourd'hui : spans sur stdout puis **perdus**. Débloque RealityMirror/`/learn`.
  - **Windmill** (workflows) : conteneur déployé + l'app émise route ses ops async (S73/S74) vers Windmill (plus seulement le worker local). Aujourd'hui : 0 conteneur, affiché « provisionné ».
  - **NATS** (bus) : client émis + outbox async publie. Aujourd'hui : env présent, `console.log` seul.
  - **Valkey** (cache) : client émis + cache lecture GET /entities. Aujourd'hui : env présent, inutilisé.
  - **Doltgres** (hors-prod) : la db role=datastore est doltgresql en non-prod (git-for-data, point de restauration) + spike sqlc/pgx sur le wire ; Postgres en prod (ADR 0006). Aujourd'hui : postgres:16 partout, URL Doltgres **fictive** (cf. 0080).
  - **Better-Auth** : middleware session + `AUTH_URL`. Aujourd'hui : `$.auth` = header local, jamais relié.
- **Branche.** `back/runtime/honoemit/scaffold.go` (clients émis + deps), `pulumi_stack_hono.go` (env + conteneurs Windmill/NATS/Valkey/auth par stack ou partagés), `.deploy-pulumi/otel/config.yaml` (exporter PG), `materialise_hono.go` (image db Doltgres non-prod).
- **Sévérité.** high — c'est « l'app codée depuis ses specs **avec sa vraie full-stack** ».

### ADR 0077 — Un seul chemin de déploiement + les vrais verbes métier par projet
- **Décision.** (1) `deployCurrentProject()` unique (emitApp + entités + `sessionScreenOverrides`) réutilisé par **createProject ET EnvsClient** (anti-double-source ; aujourd'hui createProject déploie `[]` vide). (2) Projection `kernel.operation` → `[]Operation` par projet (S17/S31) : `projectServerSpec` lit les ops du store → l'app émise a ses **vrais verbes métier** (plus le `createOrder` figé mort). (3) Rebuild déterministe du binaire `aidospulumi-bin` (Makefile/hook si `cmd/aidospulumi` change).
- **Branche.** `front/web/app/v3/V3Session.tsx` + `EnvsClient.tsx`, `back/cmd/aidospulumi/materialise_hono.go` (l. 408 `createOrder` figé).
- **Sévérité.** high — le cœur de « vraie app codée depuis ses specs ».

### ADR 0078 — Governance branchée sur les VRAIS runs (plus les fixtures)
- **Décision.** Le ledger Merkle `back/runtime/agentrun/ledger.go` reçoit `Append(r)` sur **chaque AgentRun réel** (plus `ledgerRuns()` 3 fixtures hardcodées) ; OWASP/policy (`runtime/governance`, package orphelin) dans un chemin de décision vivant (gate BA13 ou MCP governance) ; policy.yaml→GateAction (GV05).
- **Branche.** `back/mcp/agentloop/ledger.go`, `back/runtime/governance/*` (aucun importeur hors test aujourd'hui).
- **Sévérité.** high — un dispositif de preuve qui ne prouve qu'une démo.

### ADR 0079 — DiffusionGemma (bench LLM différentiel) : REPLANIFIÉ [décision prise — on le garde]
- **Décision (utilisateur, 2026-06-15 : « on remet diffusiongemma »).** GARDÉ : `ROADMAP-diffusiongemma.md` spike-gated (comme HR/MK/CE) — un port replaceable + miroir ; l'idée = **maximiser les TYPES de requirement manquants** qu'un recompile oublierait (pas un score pass/fail) ; DiffusionGemma (Gemma diffusion, code/structured) comme un des modèles du bench différentiel. Spike → ADR « bench différentiel replaceable derrière un port » → si rentable, adapter.
- **Branche.** `docs/plan/ROADMAP-diffusiongemma.md` (à écrire) + un port Go bench + miroir de reproductibilité.
- **Sévérité.** low (spéculatif, spike-gated, en dernier).

### ADR 0080 — Sondes de stack + honnêteté des services
- **Décision.** Chaque STACK_SERVICE à `urlPattern` non vide est **sondé HTTP** dans `/v3/environnements` (réutilise le motif `provisionStatusAction`). Les services qui MENTENT sont câblés OU déclassés : **Windmill** (0 conteneur, affiché level-1 provisionné), **connectors** (`mcp-gateway:3000` inexistant, affiché live), **Doltgres** (URL fictive — db réelle = postgres:16).
- **Branche.** `front/web/lib/v3/instance.ts` (STACK_SERVICES levels), `front/web/app/v3/environnements/EnvsClient.tsx` (sondes), `materialise_hono.go` (Doltgres vs postgres).
- **Sévérité.** medium (mensonges d'écran).

### ADR 0081 — Statut des capacités Go dormantes (référence / branchée / trim)
- **Décision, par package.** Pour chaque capacité Go orpheline : **brancher** (à son point d'entrée), **documenter comme oracle-de-test gouverné** (ADR 0072 — le Go est la référence), ou **`/trim`**.
  - À brancher : MutationRunner S40 (le Stop §8 en dépend), reality-ingest/telemetry S43 (l'on-ramp prod→kernel), EvolutionSandbox S42.
  - Candidats trim/doc : `endpointfitness`, `debt/trim`, `archive/brain/contextgraph` (le front a son lib), `runtime/backup`, `checkout`, `connectordeclare/infra/enforce/audit`, `deploycockpit`, `archive/curation`, `reality/workbenchgraph`.
- **Sévérité.** medium (monstres §1 — capacité sans chemin vivant).

### À FINALISER (proposed → accepted)
- **ADR 0038 — CE02 capitalisation loop (compound).** Statut « proposed ». Décider + le brancher (compound branché fin-de-goal — voir branchement B-Compound).
- **ADR 0062 — Instance, workspaces et grille.** Statut « proposed ». Décider (le contenu est déjà live en v3) → accepted.

---

## B. LE BACKLOG DE BRANCHEMENTS (les 5 outils + le reste, sous leur ADR)

| Branchement | Gouverné par | Quoi / Où | Sévérité |
|---|---|---|---|
| **Headroom** : injecter `ContextCompressor` dans `agentloop/scenario.go::buildDriveInput` + enregistrer le MCP `headroom` (registry) + Sidecar process-backed (binaire réel) | 0035 + 0074 | `back/runtime/agentloop`, `back/runtime/gateway/registry.go`, `back/runtime/headroom` | medium |
| **Compound** : skill `/compound` fin-de-goal → `compound.Compound(GoalClose)` via `firewall.ViaIdea` ; `compound.Reuse` dans ContextRouter/MatchRole | 0038 + 0074 | `.claude/skills/compound`, `back/runtime/scheduler/matchrole.go` | high |
| **MarkItDown** : `DocConverter` process-backed (binaire microsoft/markitdown, PDF/OCR/audio ; HTML fallback) + serveur idea-intake au launcher | 0039 + 0074 | `back/runtime/markitdown`, `back/mcp/idea-intake`, `.mcp.json` | medium |
| **Functional** : émettre `.dependency-cruiser.js` + `.eslintrc`(eslint-plugin-functional) dans l'app générée (la garde fail-closed DANS l'app) | 0036 + 0076 | `back/runtime/honoemit/scaffold.go` | low |
| **Governance** : ledger sur vrais runs + import dans le chemin de décision | 0078 | cf. ADR 0078 | high |
| **Bouton mort `/v3/emetteurs` « Proposer→/goal »** : `onClick` → `send("capture l'idée : adapter la source …")` (le frère `/v3/parametrage` montre le pattern) | ui-completeness §6/§7 | `front/web/app/v3/emetteurs/EmetteursClient.tsx:466` | medium |
| **Affordance « Émettre »** : vrai `<button>` ou relabel pastille de statut | ui-completeness | même fichier l.160 | low |
| **CLI `aidos` verbes print-only** : router vers le moteur Go OU retirer du registre (plus de capacité headless annoncée) | 0072 + 0074 | `back/cmd/aidos/main.go` (`renderContract()`) | medium |

---

## D. INTENTIONS OUBLIÉES — nommé dans le concept, JAMAIS matérialisé (audit `wi2zxij70`)

> Réponse à « s'il en manque pas d'autres » : OUI. Le Tome est quasi-exhaustivement branché, mais **9 concepts never-materialized** subsistent. Le plus grave = un **sous-système entier** (harness templates d'Ashby) + **3 termes canoniques §161**.

### ADR 0082 — Harness templates / topologies (Ashby) **[HIGH — le plus structurant]**
- **Promis.** `back/runtime/CONTEXT.md` + KRD LIVRE IX/§48 : « un bundle guides+sensors par topologie (crud/workflow/event-processor/dashboard), des fragments composables que le sélecteur assemble — jamais un squelette nu ».
- **Manque.** `grep EventProcessor|CrudTopology|HarnessFragment|Ashby` → 0 hit Go ; le seul `sensors/` réel = `mutation`. Chaque cellule reçoit un harness ad-hoc, ce que le Tome interdit (loi d'Ashby = variété requise).
- **Décision.** Construire `back/runtime/harness/` (fragments composables que le generator instancie) — ROADMAP + steps. Non-abandonnable sans ADR explicite.

### ADR 0083 — Statut des termes canoniques §161 sans matérialisation (Vibe Lab · KIR/KMF · Maturity ladder)
- **Un seul ADR « vocabulaire orphelin »**, tranche chacun : **Vibe Lab** (⊂ /spike + EvolutionSandbox, ou step distinct ?) ; **KIR/KMF** (KIR ⊂ `kernel.records` JSONB content-addressed, KMF ⊂ la projection lisible — subsumé) ; **Maturity ladder** experimental→beta→stable→critical (⊂ l'autonomie A0-A8, ou axe orthogonal ?). Objectif : aucun terme canonique du Tome ne flotte sans chemin ni renvoi explicite. Sévérité medium (Vibe Lab) / low (KIR, Maturity).

### ADR 0084 — ProvenanceNetwork pondéré (§119.4) [LOW]
- **Promis.** `ProvenanceLink {from,to,relation∈inspired_by|derived_from|contradicted_by, weight∈weak|medium|strong, authority}`, poids versionnés+gouvernés.
- **Manque.** Seul un label UI `provenanceLinkLabel` existe ; la provenance basique (human|incident) est câblée, le réseau pondéré non. Étendre le schéma `provenance`.

### ADR 0085 — Agent Factory / Profile Resolver (FKE-14) [LOW-MEDIUM — dépend de 0082]
- **Promis.** Une fonction pure unique : `profil+harness+skills+policies+context+evidence+autonomie+police` ← attributs du kernel cible (jamais un jugement LLM). FKE-45 le liste comme delta « à faire ».
- **Manque.** Seul `MatchRole` (rôle→agent) est câblé. Bloqué par 0082 (pas de harness à résoudre sans templates). Généraliser MatchRole/ContextRouter.

### ADR 0086 — Formal caps : statut de soupape (E7) [LOW — documentaire, pas de planif active]
- Acter que **Z3/TLA+/Dafny/Alloy/UPPAAL** sont des **enums réservés, runners non branchés PAR DESIGN** (la soupape Ashby : jamais par défaut, seulement catastrophique ∧ unsampleable). Un runner sera ajouté au **premier cap T2 réel**. `prooftype.go` dit déjà E7 « NOT reachable ». Sortir l'item du flou, ne rien planifier maintenant.

### ADR 0087 + `ROADMAP-evolve-generator.md` — le générateur self-play réel [MEDIUM]
- **Promis.** §62-66/§102 : self-play Proposer/Solver + driver AlphaEvolve ; Novelty-Search/POET/MOME comme **générateurs**.
- **Manque.** Le harness `/evolve` est câblé (quarantaine, MAP-Elites, promotion-gate, Judge=miroir) mais le **producteur de candidats** est un stub (`mcp/evolve/main.go:143` `deterministicSampler` « the real self-play generator lives behind this seam »). Spike-gated derrière ce seam (même régime que DiffusionGemma). Acter que **Boids/ACO/PSO = pedigree** (jamais codés ; la vague de rouge EST la stigmergie).

### `ROADMAP-diffusiongemma.md` (sous ADR 0079, déjà décidé — à écrire)
- Y intégrer explicitement les 3 sous-items orphelins : le **bench différentiel multi-LLM**, la **métrique de complétude** (match% = types de requirement manquants), le **multimodal mockup→view-specs** (markitdown fait doc→md, pas image→view).

### Trous d'outils nommés + 1 écran (sous la table B)
- **P-1 — Budgets §3 (Semgrep·gosec·gitleaks·k6)** : par outil, câbler un budget-sensor réel OU acter en ADR que les équivalents déterministes maison suffisent. Aujourd'hui : mandatory-replaceable, 0 invocation, **pas de CI** (`.github/` absent).
- **P-2 — playwright-bdd** (mandatory §3) : l'installer + brancher les `.feature` front, OU ADR de divergence (les specs `@playwright/test` + `.feature` sur disque suffisent).
- **P-3 — CEL/expr-lang** (ADR 0007) : graver l'**ADR de divergence** — l'interpréteur Expr maison remplace délibérément CEL/expr-lang (le trou de gouvernance : le fichier dit « No new ADR »).
- **P-4 — Écran `/export` + `/found`** : le CLI Go existe (`aidospulumi/export.go`/`found.go`) mais headless → viole ui-completeness §6/§7. Ajouter une route Workbench.

> **Légitimement abandonnables (documentés, pas planifiés)** : les **formal-cap runners** (soupape par-design, ADR 0086) et les **algos d'essaim Boids/ACO/PSO** (pedigree illustratif — la vague de rouge couvre la stigmergie).

---

## C. SÉQUENCEMENT

1. **0072** (décision-mère) — d'abord ; elle dit ce qu'est « branché ».
2. **0075** (hooks build-agent) — indépendant du runtime, protège l'agent ; le mur + le done-criterion doivent tirer. Le plus structurant du contrat KRD.
3. **0074** (gateway) + **0073** (truth-store Postgres) — la couture front↔Go + la vérité live. Débloque la flotte MCP + le statut « live » des écrans.
4. **0077** (chemin de déploiement unique + ops projetées) — le cœur « vraie app depuis ses specs ».
5. **0076** (substrat émis utilisé) + **0078** (governance vraie) — OTel→PG, NATS/Valkey/auth, le ledger vrai.
6. **0080** (sondes/honnêteté) + **0081** (Go dormant trim/doc) — l'écran cesse de mentir, le code mort est acté.
7. **0082** (harness templates Ashby — HIGH, le sous-système oublié le plus structurant).
8. **0083** (termes §161) + **0084/0085** (provenance / agent-factory) + **0086** (formal-caps statut) — vocabulaire orphelin & extensions.
9. **0087 + ROADMAP-evolve-generator** + **ROADMAP-diffusiongemma** (0079) — générateurs spike-gated, en dernier.
10. **P-1..P-4** (outils nommés Semgrep/k6/playwright-bdd/CEL + écran export/found) + **0038/0062** (finaliser) — divergences d'outils & écrans, en parallèle.

> Chaque ADR gravé est tracké Linear (label `adr`) ; chaque branchement = un ticket/step. Les ADR d'abord (les décisions), puis les branchements high : **0075** (le mur build-agent) → **0074/0073** (couture + Postgres) → **0077** (déploiement+ops) → **0076** (la pile générée complète) → **0082** (harness Ashby). Les formal-caps (0086) et les algos d'essaim sont documentés comme abandonnables, pas planifiés.
