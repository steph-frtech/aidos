# SPEC — open-source-full-stack-2026 (+ couche connecteurs)

> **La spec canonique de la stack émise** — référencée par `ROADMAP-provisioning-deploy.md`
> (DP14 palette, DP30 docs) et par la lentille Instance V3 (`lib/v3/instance.ts`).
> Gravée verbatim depuis le prompt utilisateur du 2026-06-12. Toute évolution = un
> addendum daté, jamais une réécriture (anti-overwrite §9).

## Le prompt complet (verbatim utilisateur)

Tu es architecte logiciel senior, DevOps senior et expert full stack open source.

Je veux concevoir et générer une stack applicative complète, open source, self-hosted
aujourd'hui, cloud-ready demain, avec une capacité native à connecter des outils
externes via MCP, Skills, plugins, webhooks et APIs.

Le contexte :
- Docker déjà là. Traefik déjà là. **Pas de Coolify.**
- Lever la stack complète **en une seule fois** (one shot).
- **Windmill** pour les jobs/scripts/workflows (**jamais Temporal**). **Pas de Drizzle.**
- **PostgreSQL = la prod. Doltgres = hors prod uniquement.**
- Chaque composant : service Docker interne aujourd'hui → URL externe / cloud / managé demain.
- **Aucune URL/host/secret en dur** — tout passe par variables d'environnement.
- Docs de la stack : **Fumadocs + Scalar + Pagefind** (Orama en option).
- **La couche connecteurs est de première classe** : MCP, Skills, plugins, webhooks,
  APIs tierces, services cloud — branchables demain sans toucher le code métier.

### Stack cible par couche (19 niveaux)

networking · app · api · auth · documentation · data · cache · workflow_async ·
messaging · observability · errors · tickets · qa · git_ci_registry · connectors ·
agentic_interface · security · backup · deployment

| Couche | Outils |
|---|---|
| app/api | Next.js · Hono · next-intl · Better Auth · accès SQL léger (driver + repository, pas de Drizzle) |
| documentation | Fumadocs · Scalar (OpenAPI) · Pagefind (· Orama option) |
| data | PostgreSQL (prod) · Doltgres (non-prod) · migrations SQL versionnées · backups planifiés |
| cache | Valkey (· PgBouncer si charge) |
| workflow_async / messaging | Windmill · NATS |
| observability / errors | OpenTelemetry Collector · SigNoz · GlitchTip (option) |
| tickets | Plane |
| qa | Vitest · Playwright · k6 (· Allure, Kiwi TCMS options) |
| git_ci_registry | Forgejo + Actions + Registry (· Woodpecker alternative) |
| deployment | Docker · Compose · Traefik · réseaux internes · env/secrets par environnement |
| connectors / agentic_interface | MCP Gateway interne · MCP servers par domaine · Skills packagés · Tool Registry · Connector Registry · Webhook Gateway · API Gateway (Hono) · droits par connecteur · scopes read-only/read-write · journalisation de chaque action · séparation interne/externe/IA/cloud |

### Connecteurs prévus demain
Gmail · Google Drive · Google Calendar · GitHub/Forgejo · PostgreSQL read-only ·
Snowflake · ERP · CRM · SIRH · Slack/Teams · navigateur/scraping contrôlé · fichiers ·
recherche documentaire · agent IA externe · service cloud managé.

### Principe fondamental de connexion
- **Aujourd'hui** : réseau Docker interne, URLs = noms de services (`postgres:5432`,
  `valkey:6379`, `windmill:8000`, `nats:4222`).
- **Demain** : URLs externes/managées (`DATABASE_URL`, `CACHE_URL`, `WINDMILL_URL`,
  `NATS_URL`, `MCP_GATEWAY_URL`). **Le code métier ne change pas — seules les
  variables d'environnement changent.**

### Conventions d'URLs
- Prod publiques : `APP_PUBLIC_URL`, `API_PUBLIC_URL`, `DOCS_PUBLIC_URL`,
  `WINDMILL_PUBLIC_URL`, `SIGNOZ_PUBLIC_URL`, `FORGEJO_PUBLIC_URL`, `PLANE_PUBLIC_URL`,
  `MCP_GATEWAY_PUBLIC_URL`, `WEBHOOK_GATEWAY_PUBLIC_URL`.
- Interne Docker : `DATABASE_URL=postgresql://app:${POSTGRES_PASSWORD}@postgres:5432/app`,
  `CACHE_URL=redis://valkey:6379`, `NATS_URL=nats://nats:4222`,
  `WINDMILL_INTERNAL_URL=http://windmill:8000`,
  `OTEL_EXPORTER_OTLP_ENDPOINT=http://opentelemetry-collector:4318`,
  `MCP_GATEWAY_INTERNAL_URL=http://mcp-gateway:3000`.
- Future cloud : mêmes variables, endpoints managés (`rediss://`, `tls://`…).

### Le one-shot
`make bootstrap && make up` (ou `./scripts/bootstrap.sh && ./scripts/up.sh`).
Bootstrap : vérifie Docker/Compose/Traefik, crée réseaux+volumes, génère les .env
depuis .env.example, vérifie secrets/ports, prépare Postgres+migrations+backups,
démarre dans l'ordre, healthchecks, affiche les URLs.
Compose à **profils** : core · docs · observability · qa · git · tickets ·
connectors · non-prod · full.
Services minimum : app-nextjs, api-hono, docs-fumadocs, postgres, valkey,
pgbouncer (opt), windmill, nats, otel-collector, signoz, forgejo, plane,
mcp-gateway, webhook-gateway, connector-registry, tool-registry.

### Arborescence cible
/apps (web, api, docs) · /packages (config, database, auth, connectors, mcp, skills,
observability, shared) · /infra (docker, traefik, postgres, pgbouncer, valkey,
windmill, nats, signoz, forgejo, plane, backups) · /skills · /mcp-servers
(postgres-readonly, forgejo, filesystem, observability, windmill, custom-business-tools)
· /docs (architecture, services, connectors, environments, runbooks, security,
operations) · /tests (unit, e2e, load) · /scripts (bootstrap.sh, up.sh, down.sh,
backup.sh, restore.sh, healthcheck.sh, rotate-secrets.sh).

### Modèles JSON
La stack, chaque service, chaque connecteur, chaque Skill, chaque MCP server suivent
les modèles JSON du prompt d'origine (stack{environments local/dev/staging/prod/
future_cloud, layers, services[], connectors[], skills[], mcp_servers[], networks,
volumes, secrets, deployment_commands} ; service{layer, production_policy,
connections{current docker_internal/external traefik_url/future managed_url},
environments par env, criticality} ; connector{category, protocol, permissions
{default_scope, requires_human_approval}, audit{otel}} ; skill{security_policy} ;
mcp_server{domain, transport, tools[{permission, requires_human_approval}]}).

### Les trois niveaux
- **Niveau 1 — core prod dès le départ** : Next.js, Hono, PostgreSQL, Valkey,
  Better Auth, Traefik, Windmill, NATS, OTel Collector, SigNoz, Fumadocs, Scalar, Pagefind.
- **Niveau 2 — prod utile, activable progressivement** : PgBouncer, Forgejo (+Actions),
  Plane, GlitchTip, Allure, MCP Gateway, Connector Registry, Tool Registry, Webhook Gateway.
- **Niveau 3 — hors prod / option avancée** : Doltgres, Kiwi TCMS, Orama, Woodpecker,
  MCP servers expérimentaux, Skills expérimentaux, connecteurs read-write non validés.

### Lois de sécurité agentique
Les agents IA n'accèdent JAMAIS directement aux bases/outils critiques — toujours via
un connecteur contrôlé ; les connecteurs read-write ont une option d'approbation
humaine ; chaque appel est loggé, tracé (OTel) et auditable.

## Correspondance AIDOS (où chaque chose vit)

| Spec | Dans AIDOS aujourd'hui |
|---|---|
| Le one-shot bootstrap + compose à profils | **la piste DP** (`ROADMAP-provisioning-deploy.md` DP01–DP33, BUILDER_PLAN E9/E10) — prête à lancer |
| La palette substrat | DP14 (spike-gate) ; déclarée côté V3 dans `lib/v3/instance.ts` (`STACK_SERVICES`) |
| Docs de l'app émise (Fumadocs/Scalar/Pagefind) | DP30 (distinct du Mintlify d'AIDOS) |
| Postgres prod / Doltgres non-prod | ADR 0006 + `envStackOf` (le motif db par env) |
| Le nombre d'environnements paramétrable | `ladderOf` (config `ladder`) + `BuilderState.ladder` (ADR 0062 addendum) |
| La couche connecteurs/MCP | ADR 0009 (chaque op backend = un MCP tool) + les `back/mcp/*` existants ; gateway/registries = DP |
| Variables d'env par environnement | `.aidos-instance.json` (V3) aujourd'hui ; conventions `*_URL` de la spec à l'émission (DP) |
