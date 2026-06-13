# ADR 0068 — DP14 : la palette substrat 2026 VALIDÉE PAR MESURE — 11 go / 1 no-go

- **Statut :** accepté (verdict mesuré, jamais déclaré)
- **Date :** 2026-06-13
- **Étape :** DP14 (`ROADMAP-provisioning-deploy.md` EPIC D — substrat émis, SPIKE-gate, ratchet OFF, rigueur T0)
- **Zone :** `/spike` exclusivement (code jetable, aucune écriture `kernel`/`mirrors`/`fitness`, 0 conteneur spike laissé)

## Contexte

La spec `open-source-full-stack-2026` (`docs/plan/SPEC-stack-2026.md`) déclare le substrat des apps qu'AIDOS émet — la palette de services que les profiles de DP11 sélectionnent et que `stack.bootstrap` (DP12/DP13) lèvera. Avant de graver le moindre service en **fragment StackManifest** (DP15+), la roadmap exige de **prouver par mesure** que chaque service boote réellement : un service déclaré mais non amorçable est un vœu. La règle d'honnêteté (§8) interdit de graver un substrat sur la foi d'un README — il faut le boot, le healthcheck vert, le port joignable.

Un service `no-go` ne tue pas la roadmap : il **réduit le sujet** (on ne grave pas ce qu'on n'a pas pu mesurer), il ne le devine pas (un no-go n'invente jamais un vert absent).

## La sonde (jetable, déterministe)

Spike `/spike` du 2026-06-13 : chaque service de la palette est **sondé par la mesure** — boot du conteneur (ou `docker ps` d'un conteneur déjà sain sur l'hôte), healthcheck vert, port joignable `docker_internal` cross-container. Le boot a lieu **au spike** ; il en sort une **donnée pure et close** — la palette gravée `front/web/lib/substrate-palette.ts` (type `SubstrateService{key,name,layer,verdict,proof,alternative,slot,level}`, `SUBSTRATE_PALETTE[12]`, `paletteCounts()`, `verdictOf()`) — et son **miroir T0** `front/web/lib/substrate-palette.test.ts` qui asserte la matrice gravée + sa forme (jeu clos, chaque entrée porte un verdict, comptes). Le miroir **ne boote rien** : le boot a déjà eu lieu, le test grave et vérifie la donnée (10/10 vert via `npx vitest run`).

## Les mesures (le verdict est une MESURE, jamais un avis LLM)

| # | Service | Couche | Slot | Niv. | Verdict | Preuve (mesurée) |
|---|---|---|---|---|---|---|
| 1 | **PostgreSQL** | data | mandatory | 1 | **GO** | `docker ps` : alphashop-db-1 / guestbook-db-1 / supabase-db (`postgres:16-alpine`) healthy ; `pg_isready` → accepting connections |
| 2 | **Valkey** | cache | mandatory | 1 | **GO** | boot `valkey/valkey:8-alpine` ; `valkey-cli ping` → PONG |
| 3 | **PgBouncer** | cache | replaceable | 2 | **GO** | boot `edoburu/pgbouncer:latest` ; log « process up: PgBouncer 1.25.2 » + « listening on 0.0.0.0:5432 » ; `nc` cross-container 5432 → REACHABLE |
| 4 | **Windmill** | workflow_async | mandatory | 1 | **NO-GO** | boot NON observable : `ghcr.io/windmill-labs/windmill:main` UNIQUEMENT sur ghcr.io, registre REFUSÉ en sandbox (`Get /v2/` → denied ; PAT expiré + pull anonyme bloqué ; même denial sur litellm/lsp) ; contrat canonique confirmé (docs officielles : MODE=server, port 8000, healthcheck GET /api/health). **Indisponibilité-de-registre, PAS un défaut de service.** |
| 5 | **NATS** | messaging | mandatory | 1 | **GO** | boot `nats:2.10-alpine` ; `/varz` monitor répond (server v2.10.29) ; 4222 joignable cross-container |
| 6 | **OpenTelemetry Collector** | observability | replaceable | 1 | **GO** | boot `otel/opentelemetry-collector-contrib:latest` (v0.154.0) ; log « Everything is ready » ; OTLP 4317 (gRPC) + 4318 (HTTP) listening + joignables |
| 7 | **SigNoz** | observability | replaceable | 1 | **GO** | boot `signoz/signoz:latest` (+ volume `/var/lib/signoz` writable — 1er boot sans volume crashait « unable to open database file ») ; log « Query server started listening on 0.0.0.0:8080 » ; 8080 joignable |
| 8 | **GlitchTip** | errors | replaceable | 2 | **GO** | boot `glitchtip/glitchtip:latest` (+ Postgres + Valkey) ; bannière « Cache/Queue: Valkey » + « Started worker-1 » ; log « Listening at: http://0.0.0.0:8080 » ; 8080 joignable |
| 9 | **Forgejo** | git_ci_registry | replaceable | 2 | **GO** | boot `codeberg.org/forgejo/forgejo:9` ; GET `/api/healthz` → `{status: pass}` |
| 10 | **Plane** | tickets | replaceable | 2 | **GO** | boot `makeplane/plane-frontend:latest` (node web/server.js) ; Next.js 14.2.14 « Ready in 99ms » ; 3000 joignable |
| 11 | **Better-Auth** | auth | mandatory | 1 | **GO** | `docker ps` : conteneur better-auth déjà sur l'hôte, health=healthy ; sert du HTML sur :3000 |
| 12 | **Docs** (Fumadocs + Scalar + Pagefind) | documentation | mandatory | 1 | **GO** | librairies npm (servies par l'app Next docs-fumadocs, pas des conteneurs autonomes) : fumadocs-core@16.10.2, fumadocs-ui@16.10.2, @scalar/api-reference@1.59.3, pagefind@1.5.2 résolvent sur le registre npm |

**Comptes (`paletteCounts()`, PUR & DÉTERMINISTE) :** total 12 · **go 11** · **no-go 1** · mandatory 5 · replaceable 7. Le seul no-go niveau-1 est **Windmill** (indispo-registre).

## Les contraintes dures honorées

La spec porte des contraintes **non négociables** ; la palette les respecte par construction :

- **Coolify OUT** — Docker + Traefik sont déjà là, aucun orchestrateur Coolify dans la palette.
- **Drizzle non imposé** — accès SQL léger (driver + repository), jamais Drizzle ; aucun fragment ne l'introduit.
- **Windmill, JAMAIS Temporal** — le slot workflow_async reste Windmill. Son no-go DP14 est une indisponibilité-de-registre, **pas** une porte vers Temporal : l'alternative Temporal est explicitement **REFUSÉE** (contrainte dure). Windmill reste le moteur validé du slot.
- **PostgreSQL = la prod · Doltgres = hors prod uniquement** (ADR 0006) — Postgres est `go` mandatory niveau-1 ; Doltgres n'est pas dans la palette de boot, il reste l'alternative non-prod du slot data, jamais en prod.

## Les no-go RETIRÉS — décision enregistrée

Le seul no-go mesuré est **Windmill**, et son retrait est une **décision enregistrée**, jamais un silence :

- Windmill **reste dans la palette** comme `no-go` honnête (non deviné) : son boot n'a pas pu être mesuré dans la fenêtre du spike (registre ghcr.io refusé en sandbox), mais le contrat health officiel + l'image officielle sont confirmés. Un no-go réduit le sujet — on ne grave pas un fragment qu'on n'a pas pu booter — il ne fabrique pas un vert absent.
- **À re-mesurer** quand ghcr.io redevient pullable (PAT GitHub valide `read:packages`, ou miroir). Le no-go n'est PAS un défaut de Windmill ; c'est l'absence d'un boot in-window.

## Décision

**La palette `open-source-stack-2026` est VALIDÉE PAR MESURE : 11 services go, 1 no-go (Windmill, indispo-registre).**

**Conséquence DP15+ : seuls les services `go` deviennent des fragments StackManifest.** Le no-go Windmill ne se grave **pas** en fragment tant que son boot n'a pas été re-mesuré ; les contraintes dures (Coolify out, Drizzle non imposé, Windmill ≠ Temporal, Postgres prod / Doltgres non-prod) sont portées par les fragments gravés. La gravure passe par **idée → miroir → /goal → ChangeSet** : le harvest du spike ouvre une idée (proposes=fragments StackManifest), jamais une écriture en passant.

## Récolte (/harvest) — la marche suivante

Le spike laisse une **donnée + son test** ; le harvest/ADR est la marche suivante (NON faite au spike — le mur interdit l'écriture-vérité). Le harvest ouvrira une idée content-adressée (proposes=stack_manifest fragments, provenance human, has_mirror=false — propose, ne fige jamais) ; la promotion reste `/goal`.

## Le mur & le cliquet

Zone `/spike` uniquement : aucune écriture `kernel`/`mirrors`/`fitness`, aucune persistance, **0 conteneur spike laissé** (teardown complet). Ratchet OFF (T0) — mais le mandat déterminisme-first tient : la palette est une **donnée pure et close** produite par le boot/healthcheck, son miroir l'asserte sans rien booter, et l'anti-overwrite est explicite (étendre = addendum daté). Anti-overwrite vérifié : `lib/v3/instance.test.ts` reste 6/6 vert ; `lib/substrate-palette.test.ts` 10/10 vert ; `biome check --write` propre ; TS uniquement, Go non touché.

## Preuves

- Palette gravée : `front/web/lib/substrate-palette.ts` (la matrice 12 services × verdict mesuré).
- Miroir T0 : `front/web/lib/substrate-palette.test.ts` (10/10 vert via `npx vitest run`).
- Anti-overwrite : `front/web/lib/v3/instance.test.ts` 6/6 toujours vert.
