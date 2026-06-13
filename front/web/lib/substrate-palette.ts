/**
 * DP14 — LA PALETTE SUBSTRAT MESURÉE (spike-gate T0, zone /spike, ratchet OFF).
 *
 * Spec : `docs/plan/SPEC-stack-2026.md` (open-source-full-stack-2026). Chaque
 * service de la palette a été SONDÉ par la mesure le 2026-06-13 (boot + healthcheck
 * vert + joignable docker_internal), AVANT toute gravure en fragments StackManifest.
 *
 * LE VERDICT EST UNE MESURE, JAMAIS UN AVIS :
 *  - `go`     : booté + healthcheck vert + port joignable (ou déjà conteneurisé,
 *               sain, sur l'hôte — `docker ps` compte comme mesure) ;
 *  - `no-go`  : indisponible / timeout / échec de boot — ENREGISTRÉ, jamais deviné.
 *
 * Honnêteté (§8) : un `no-go` réduit le sujet, il ne le devine pas. Un service dont
 * le boot N'A PAS PU être mesuré dans la fenêtre du spike (ex. registre ghcr.io
 * refusé en sandbox) est marqué `no-go` avec la cause exacte — le code ne fabrique
 * pas un vert qu'il n'a pas observé. Windmill reste le moteur de workflows validé
 * du slot (JAMAIS Temporal — contrainte dure) : son no-go ici est une
 * indisponibilité-de-registre, pas un défaut de service.
 *
 * Déterminisme-first (§6) : cette palette est une DONNÉE pure et close. Le verdict
 * a été produit par le boot/healthcheck au spike ; ce fichier le GRAVE, et son
 * miroir (`substrate-palette.test.ts`) asserte la matrice gravée + sa forme — il
 * NE boote rien (le boot a déjà eu lieu). Anti-overwrite : étendre = addendum daté.
 *
 * MUR : zone /spike, aucune écriture-vérité (kernel/mirrors/fitness). Code jetable
 * confiné, ne casse aucun test existant.
 */

/** Le verdict mesuré d'un service du substrat. */
export type SubstrateVerdict = "go" | "no-go";

/** Le slot frozen-stack : mandatory = jamais substituable ; replaceable = ADR. */
export type SubstrateSlot = "mandatory" | "replaceable";

/** Un service de la palette substrat avec son verdict MESURÉ et sa preuve. */
export interface SubstrateService {
	/** La clé stable du service (jumelle des clés `STACK_SERVICES` de instance.ts). */
	readonly key: string;
	/** Le nom canonique du service / image sondée. */
	readonly name: string;
	/** La couche de la spec stack-2026. */
	readonly layer: string;
	/** Le verdict — une MESURE (boot/healthcheck), jamais un avis. */
	readonly verdict: SubstrateVerdict;
	/** La preuve de la mesure (port / healthcheck / `docker ps` / cause du no-go). */
	readonly proof: string;
	/** L'alternative comparée si pertinente (sinon vide). */
	readonly alternative: string;
	/** Le slot frozen-stack. */
	readonly slot: SubstrateSlot;
	/** Le niveau de la spec : 1 = core prod, 2 = activable, 3 = hors prod/option. */
	readonly level: 1 | 2 | 3;
}

/**
 * LA MATRICE service × verdict — 12 services, jeu CLOS. Chaque entrée porte son
 * verdict mesuré au spike DP14 + la preuve. Gravée le 2026-06-13.
 */
export const SUBSTRATE_PALETTE: readonly SubstrateService[] = [
	{
		key: "postgres",
		name: "PostgreSQL",
		layer: "data",
		verdict: "go",
		proof:
			"docker ps : alphashop-db-1 / guestbook-db-1 / supabase-db (postgres:16-alpine) healthy ; pg_isready → accepting connections",
		alternative: "Doltgres = non-prod uniquement (ADR 0006)",
		slot: "mandatory",
		level: 1,
	},
	{
		key: "valkey",
		name: "Valkey",
		layer: "cache",
		verdict: "go",
		proof: "boot valkey/valkey:8-alpine ; valkey-cli ping → PONG",
		alternative: "Redis (Valkey = fork open-source BSD, drop-in)",
		slot: "mandatory",
		level: 1,
	},
	{
		key: "pgbouncer",
		name: "PgBouncer",
		layer: "cache",
		verdict: "go",
		proof:
			"boot edoburu/pgbouncer:latest ; log « process up: PgBouncer 1.25.2 » + « listening on 0.0.0.0:5432 » ; nc cross-container 5432 → REACHABLE",
		alternative:
			"pooling natif Postgres (PgBouncer = pooler dédié, opt. sous charge)",
		slot: "replaceable",
		level: 2,
	},
	{
		key: "windmill",
		name: "Windmill",
		layer: "workflow_async",
		verdict: "no-go",
		proof:
			"boot NON mesuré : image ghcr.io/windmill-labs/windmill:main UNIQUEMENT sur ghcr.io, registre refusé en sandbox (Get /v2/ → denied, PAT expiré + anon bloqué) ; contrat canonique confirmé (docs : MODE=server, port 8000, healthcheck GET /api/health) ; indisponibilité-de-registre, PAS un défaut de service",
		alternative:
			"Temporal — REFUSÉ (contrainte dure : Windmill, jamais Temporal). Windmill reste le moteur du slot.",
		slot: "mandatory",
		level: 1,
	},
	{
		key: "nats",
		name: "NATS",
		layer: "messaging",
		verdict: "go",
		proof:
			"boot nats:2.10-alpine ; /varz monitor répond (server v2.10.29) ; port 4222 joignable cross-container",
		alternative: "RabbitMQ / Kafka (NATS = bus léger, choix spec)",
		slot: "mandatory",
		level: 1,
	},
	{
		key: "otel-collector",
		name: "OpenTelemetry Collector",
		layer: "observability",
		verdict: "go",
		proof:
			"boot otel/opentelemetry-collector-contrib:latest (v0.154.0) ; log « Everything is ready » ; OTLP 4317 (gRPC) + 4318 (HTTP) listening + joignables cross-container",
		alternative: "—",
		slot: "replaceable",
		level: 1,
	},
	{
		key: "signoz",
		name: "SigNoz",
		layer: "observability",
		verdict: "go",
		proof:
			"boot signoz/signoz:latest (+ volume /var/lib/signoz writable) ; log « Query server started listening on 0.0.0.0:8080 » ; port 8080 joignable cross-container",
		alternative: "Grafana+Tempo (SigNoz = suite intégrée, choix spec)",
		slot: "replaceable",
		level: 1,
	},
	{
		key: "glitchtip",
		name: "GlitchTip",
		layer: "errors",
		verdict: "go",
		proof:
			"boot glitchtip/glitchtip:latest (+ Postgres + Valkey) ; bannière « Cache/Queue: Valkey » + « Started worker-1 » ; log « Listening at: http://0.0.0.0:8080 » ; port 8080 joignable cross-container",
		alternative:
			"Sentry self-hosted (GlitchTip = fork léger compatible Sentry SDK)",
		slot: "replaceable",
		level: 2,
	},
	{
		key: "forgejo",
		name: "Forgejo",
		layer: "git_ci_registry",
		verdict: "go",
		proof:
			"boot codeberg.org/forgejo/forgejo:9 ; GET /api/healthz → { status: pass } (cache:ping pass)",
		alternative:
			"Gitea (Forgejo = fork community-driven), Woodpecker pour le CI",
		slot: "replaceable",
		level: 2,
	},
	{
		key: "plane",
		name: "Plane",
		layer: "tickets",
		verdict: "go",
		proof:
			"boot makeplane/plane-frontend:latest (node web/server.js) ; Next.js 14.2.14 « Ready in 99ms » ; port 3000 joignable cross-container",
		alternative: "—",
		slot: "replaceable",
		level: 2,
	},
	{
		key: "better-auth",
		name: "Better-Auth",
		layer: "auth",
		verdict: "go",
		proof:
			"docker ps : conteneur better-auth déjà sur l'hôte, health=healthy ; sert du HTML sur :3000",
		alternative: "—",
		slot: "mandatory",
		level: 1,
	},
	{
		key: "docs",
		name: "Fumadocs + Scalar + Pagefind",
		layer: "documentation",
		verdict: "go",
		proof:
			"librairies npm (servies par l'app Next docs-fumadocs, pas des conteneurs autonomes) : fumadocs-core@16.10.2, fumadocs-ui@16.10.2, @scalar/api-reference@1.59.3, pagefind@1.5.2 résolvent sur le registre npm",
		alternative: "Orama (option recherche, au lieu de Pagefind)",
		slot: "mandatory",
		level: 1,
	},
] as const;

/** Les comptes de la palette — un jeu clos, chaque entrée a un verdict. */
export interface PaletteCounts {
	readonly total: number;
	readonly go: number;
	readonly noGo: number;
	readonly mandatory: number;
	readonly replaceable: number;
}

/** Compte la palette. PUR & TOTAL & DÉTERMINISTE. */
export function paletteCounts(
	palette: readonly SubstrateService[] = SUBSTRATE_PALETTE,
): PaletteCounts {
	return {
		total: palette.length,
		go: palette.filter((s) => s.verdict === "go").length,
		noGo: palette.filter((s) => s.verdict === "no-go").length,
		mandatory: palette.filter((s) => s.slot === "mandatory").length,
		replaceable: palette.filter((s) => s.slot === "replaceable").length,
	};
}

/** Le verdict d'un service par sa clé (undefined hors palette). PUR. */
export function verdictOf(key: string): SubstrateVerdict | undefined {
	return SUBSTRATE_PALETTE.find((s) => s.key === key)?.verdict;
}
