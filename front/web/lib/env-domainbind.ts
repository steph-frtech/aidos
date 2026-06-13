/**
 * The DP27 ENV-DOMAIN cabling twin — the Workbench /deploy « Domaine custom + TLS » source.
 *
 * The DECLARED projection of the Go package back/runtime/domainbind/envdomain.go (DP27, EPIC F):
 * the deterministic CABLING of a custom domain into ONE of the FIVE closed DP06 environments
 * (envbindings — prod/staging/dev/local/future_cloud), emitting the Traefik HTTPS labels that
 * serve the app there. It EXTENDS S97 (domainbind.ts), it does not fork it:
 *
 *   - it REUSES the S97 normalisation/validation (normalizeDomain/validDomain), the injective
 *     registry rule (bind → DOMAIN_ALREADY_BOUND, isInjective), the router name (routerNameOf)
 *     and the HTTPS judge (servesHTTPS) — a domain belongs to EXACTLY ONE project ;
 *   - it REUSES the DP06 environment table (environments.ts bindingsFor) — the TLS flag, the
 *     managed flag — so it consults the DECLARED environment, never an invented one ;
 *   - it emits the SAME canonical Traefik HTTPS label set DP03 emits (traefikHTTPSLabels here is
 *     the exact twin of composeemit.TraefikHTTPSLabels) so the compose YAML and the custom-domain
 *     binding can NEVER drift — one source.
 *
 * THE TLS RULE (DP06). A custom domain serves the app over HTTPS, so it requires an environment
 * that terminates TLS (Traefik certresolver). prod/staging/dev/future_cloud do; local does NOT
 * (it serves http://localhost:${APP_PORT}). Cabling a custom HTTPS domain into local is REFUSED
 * (fail-closed) — never a silent http downgrade.
 *
 * DETERMINISM-FIRST (CLAUDE.md §6/§8): cableInEnvironment is a PURE function of its input — no
 * clock, no rng, no I/O, no LLM. Same registry + request + env → byte-identical binding (same
 * url, router, labels). The injectivity check is a deterministic name-match (S97), never a
 * judgment. The reproducibility mirror lib/env-domainbind.test.ts (fast-check) pins it.
 *
 * READ-ONLY (the wall): the domain ROUTING (the emitted labels) is a below-the-line projection —
 * it writes no truth and makes no live DNS/ACME call. Recording the domain IN the Environment
 * (an environment truth) goes through propose → ChangeSet → approval, never a direct write from
 * the screen. The Go ProposeEnvironmentDomain owns that path; this twin only resolves + displays.
 */

import {
	type BlockReason,
	bind,
	DEFAULT_CERT_RESOLVER,
	isBlocked as isBindBlocked,
	type Label,
	normalizeDomain,
	type Registry,
	routerNameOf,
	servesHTTPS,
	validDomain,
} from "./domainbind";
import { bindingsFor, type Environment, isRefusal } from "./environments";

export type { Label, Registry } from "./domainbind";
export type { Environment } from "./environments";

/** A request to cable a custom domain into an environment. */
export interface EnvBindRequest {
	domain: string;
	project: string;
	/** the DP06 environment to cable into (prod|staging|dev|local|future_cloud). */
	environment: string;
	/** the existing domain→project registry, for the injective check (S97). */
	registry: Registry;
}

/**
 * The DETERMINISTIC result of cabling a custom domain into ONE DP06 environment: the resolved
 * domain for that env and the Traefik HTTPS labels emitted to serve the app there (DP03-canonical).
 * The exact twin of the Go EnvDomainBinding. It writes nothing; the truth-write (the domain IN the
 * Environment) goes through propose → ChangeSet → approval (the Go ProposeEnvironmentDomain).
 */
export interface EnvDomainBinding {
	environment: Environment;
	domain: string;
	project: string;
	/** the HTTPS URL the custom domain serves the app at in this environment. */
	url: string;
	/** the deterministic Traefik router name (DNS-safe, the S97 routerNameOf). */
	routerName: string;
	/** the HTTP→HTTPS redirect middleware name for this router. */
	redirectMiddleware: string;
	/** the ACME certresolver Traefik uses to mint the domain's TLS certificate. */
	certResolver: string;
	/** whether the env terminates TLS (always true for an accepted custom HTTPS domain). */
	tls: boolean;
	/** whether the env is a managed-cloud target (future_cloud). */
	managed: boolean;
	/** the EMITTED Traefik labels (DP03 reused — traefikHTTPSLabels): the websecure router on
	 * Host(`<domain>`) + tls + the ACME certresolver + the HTTP→HTTPS redirect. */
	labels: Label[];
}

export { isBlocked } from "./domainbind";

/** redirectMiddlewareOf — the deterministic HTTP→HTTPS redirect middleware name for a router:
 * "<router>-redirect" (the S97 renderLabels convention). Same router → same middleware. */
export function redirectMiddlewareOf(router: string): string {
	return `${router}-redirect`;
}

/**
 * traefikHTTPSLabels — the EXACT twin of the Go composeemit.TraefikHTTPSLabels (DP03): the single
 * canonical source of the Traefik HTTPS label vocabulary. The compose YAML and the custom-domain
 * binding both derive from it, so they can NEVER drift. `port` defaults to 0 (the custom domain
 * routes to the already-declared service — the loadbalancer port label is omitted).
 */
export function traefikHTTPSLabels(
	router: string,
	host: string,
	certResolver: string,
	redirectMiddleware: string,
	port = 0,
): Label[] {
	const labels: Label[] = [
		{ label: "traefik.enable", value: "true" },
		{
			label: `traefik.http.routers.${router}.rule`,
			value: `Host(\`${host}\`)`,
		},
		{ label: `traefik.http.routers.${router}.entrypoints`, value: "websecure" },
		{ label: `traefik.http.routers.${router}.tls`, value: "true" },
		{
			label: `traefik.http.routers.${router}.tls.certresolver`,
			value: certResolver,
		},
	];
	if (port > 0) {
		labels.push({
			label: `traefik.http.services.${router}.loadbalancer.server.port`,
			value: String(port),
		});
	}
	labels.push(
		{
			label: `traefik.http.routers.${router}-http.rule`,
			value: `Host(\`${host}\`)`,
		},
		{ label: `traefik.http.routers.${router}-http.entrypoints`, value: "web" },
		{
			label: `traefik.http.routers.${router}-http.middlewares`,
			value: redirectMiddleware,
		},
		{
			label: `traefik.http.middlewares.${redirectMiddleware}.redirectscheme.scheme`,
			value: "https",
		},
	);
	return labels;
}

function malformed(reason: string): BlockReason {
	return {
		code: "OUT_OF_SCOPE",
		severity: "blocking",
		explanation: `Câblage du domaine custom dans l'environnement refusé : ${reason}`,
		how_to_fix: [
			"Fournissez un domaine custom valide (un hôte DNS avec au moins un point, des labels DNS-safe) et un projet non vide.",
			"Choisissez un environnement DP06 connu (prod|staging|dev|local|future_cloud) qui termine le TLS — un domaine HTTPS exige un certresolver Traefik.",
			"Pour servir en local (sans TLS), gardez le sous-domaine de déploiement http://localhost:<APP_PORT> — un domaine custom HTTPS n'y est pas servable.",
		],
	};
}

/**
 * cableInEnvironment — the PURE DP27 cabling (the twin of Go ResolveInEnvironment). Given a custom
 * domain + project + the DP06 environment + the existing registry, it:
 *   1. validates the domain (S97 normalizeDomain/validDomain) + a non-empty project ;
 *   2. enforces INJECTIVITY (S97 bind → DOMAIN_ALREADY_BOUND, naming the owner) ;
 *   3. resolves the environment (environments.bindingsFor — an unknown env is refused) ;
 *   4. REQUIRES TLS — a custom HTTPS domain needs a TLS-terminating env; local is refused ;
 *   5. emits the DP03-canonical Traefik HTTPS labels + the HTTPS URL.
 * Writes nothing (the wall). Same input → byte-identical binding.
 */
export function cableInEnvironment(
	req: EnvBindRequest,
): EnvDomainBinding | BlockReason {
	const domain = normalizeDomain(req.domain);
	if (!validDomain(domain))
		return malformed(`domaine custom invalide "${req.domain}"`);
	if (!req.project.trim()) return malformed("projet vide");

	// INJECTIVITY (S97 reused, never forked) — a domain owned by ANOTHER project is refused
	// DOMAIN_ALREADY_BOUND, naming the owner. The bind call only confirms ownership here.
	const owned = bind(req.registry, {
		domain,
		project: req.project,
		deploySubdomain: "d-cable",
		deployRoot: "deploy.aidos.app",
		serverService: "svc-server",
	});
	if (isBindBlocked(owned) && owned.code === "DOMAIN_ALREADY_BOUND")
		return owned;

	const env = bindingsFor(req.environment);
	if (isRefusal(env))
		return malformed(
			`environnement "${req.environment}" hors de l'ensemble clos (prod|staging|dev|local|future_cloud)`,
		);
	if (!env.tls)
		return malformed(
			`l'environnement "${req.environment}" ne termine pas le TLS — un domaine custom HTTPS n'y est pas servable`,
		);

	const router = routerNameOf(domain);
	const redirect = redirectMiddlewareOf(router);
	const certResolver = DEFAULT_CERT_RESOLVER;
	const labels = traefikHTTPSLabels(router, domain, certResolver, redirect);

	return {
		environment: req.environment as Environment,
		domain,
		project: req.project,
		url: `https://${domain}`,
		routerName: router,
		redirectMiddleware: redirect,
		certResolver,
		tls: true,
		managed: env.managed,
		labels,
	};
}

/** envServesHTTPS — the binding's EMITTED labels actually serve the app over HTTPS (websecure +
 * tls + ACME certresolver on Host(`<domain>`)). PURE — REUSES the S97 servesHTTPS judge, never an
 * agent. */
export function envServesHTTPS(b: EnvDomainBinding): boolean {
	return servesHTTPS({
		id: "",
		domain: b.domain,
		project: b.project,
		url: b.url,
		routerName: b.routerName,
		certResolver: b.certResolver,
		labels: b.labels,
		dns: { type: "CNAME", name: b.domain, value: "" },
	});
}
