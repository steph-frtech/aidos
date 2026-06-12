/**
 * connections.ts — the PURE TS twin of the authoritative Go projection
 * `back/runtime/connresolve` (DP07 — the deterministic connection-mode
 * resolution, ROADMAP-provisioning-deploy EPIC B).
 *
 * THE MODEL: resolveConnection(service, environment) → ConnectionMode ∈ the
 * CLOSED three-member set {docker_internal, traefik_url, managed_url} — the
 * algorithm (never a prompt) that wires the emitted stack's services to each
 * other and to the outside WITHOUT ONE hardcoded endpoint (SPEC-stack-2026:
 * « AUCUNE URL/secret en dur — tout par variables d'environnement »).
 *
 * THE RULES (declared, never learned — the exact twin of the Go switch):
 *   - a MANAGED environment (future_cloud, DP06 binding) → managed_url for
 *     everything;
 *   - a connector-role service → managed_url in EVERY environment — its URL
 *     comes from the S91 secret store at boot (${<SERVICE>_MANAGED_URL});
 *   - the server role → traefik_url (https://${APP_SUBDOMAIN}.${DOMAIN}) on
 *     every traefik_default environment (prod/staging/dev), docker_internal
 *     on the local machine (no reverse proxy there);
 *   - everything else → docker_internal: ${APP_NAME}[-<service>]:<port> on
 *     the shared docker network — never localhost, never an IP.
 *
 * DETERMINISM-FIRST (CLAUDE.md §6/§8): the GO CODE IS AUTHORITATIVE; this
 * twin is byte-parity-pinned to it (GO_MATRIX_HASH in connections.test.ts —
 * the canonical demo matrix must hash to the EXACT address the Go side
 * measured). Canonical form = records.Canonicalize (S02): keys sorted
 * recursively, no insignificant whitespace; address = sha256 hex.
 *
 * THE WALL (CLAUDE.md §2): this module never writes — it is a below-the-line
 * projection; the /environments route only READS and RE-MEASURES.
 */

import type { Environment } from "./environments";
import { bindingsFor, ENVIRONMENTS, isRefusal } from "./environments";

export type { Environment } from "./environments";
export { ENVIRONMENTS } from "./environments";

/** The CLOSED connection-mode set (DP07). */
export const MODES = ["docker_internal", "traefik_url", "managed_url"] as const;
export type ConnectionMode = (typeof MODES)[number];

export function isKnownMode(m: string): m is ConnectionMode {
	return (MODES as readonly string[]).includes(m);
}

/** The CLOSED DP02 role set (twin of stackmanifest.Roles(), canonical order). */
export const ROLES = [
	"server",
	"datastore",
	"cache",
	"pooler",
	"workflow",
	"bus",
	"observability",
	"errortracking",
	"git",
	"tickets",
	"auth",
	"docs",
	"connector",
	"interpreter",
] as const;
export type ServiceRole = (typeof ROLES)[number];

export function isKnownRole(r: string): r is ServiceRole {
	return (ROLES as readonly string[]).includes(r);
}

/** One stack service (twin of the DP02 stackmanifest.Service fields DP07 reads). */
export interface StackService {
	name: string;
	role: ServiceRole | string;
	internal_port: number;
}

/**
 * One resolution — HOW a consumer reaches `service` in `environment`
 * (twin of Go connresolve.Resolution; ${VAR} references only, never values).
 */
export interface Resolution {
	service: string;
	role: string;
	environment: Environment;
	mode: ConnectionMode;
	endpoint_pattern: string;
	env_vars: string;
}

/** The closed refusal codes (DP06 reused + the DP07 package-local additions). */
export type ConnRefusalCode =
	| "UNKNOWN_ENVIRONMENT"
	| "UNKNOWN_ROLE"
	| "UNNAMED_SERVICE";

export interface ConnRefusal {
	code: ConnRefusalCode;
	message: string;
}

export function isConnRefusal(v: Resolution | ConnRefusal): v is ConnRefusal {
	return "code" in v;
}

/** managedVar — the S91 secret-store env-var reference: <NAME>_MANAGED_URL. */
function managedVar(name: string): string {
	return `${name.toUpperCase().replace(/[^A-Z0-9]/g, "_")}_MANAGED_URL`;
}

/** containerHost — the /data/dockers container-name convention (DP03 reused). */
function containerHost(svc: StackService): string {
	// biome-ignore lint/suspicious/noTemplateCurlyInString: the host is the LITERAL env-var reference (never a value) — the DP03–DP05 law.
	if (svc.role === "server") return "${APP_NAME}";
	return `\${APP_NAME}-${svc.name}`;
}

/**
 * resolveConnection — THE DP07 pure function, the exact twin of Go
 * connresolve.ResolveConnection. Fail-closed outside the closed sets; total
 * and deterministic inside them. Never localhost, never an IP, never a value.
 */
export function resolveConnection(
	svc: StackService,
	env: string,
): Resolution | ConnRefusal {
	const binding = bindingsFor(env);
	if (isRefusal(binding)) {
		return { code: "UNKNOWN_ENVIRONMENT", message: binding.message };
	}
	if (svc.name === "") {
		return {
			code: "UNNAMED_SERVICE",
			message:
				"a service without a name cannot be wired — declare the service name in the StackManifest (idea → mirror → /goal)",
		};
	}
	if (!isKnownRole(svc.role)) {
		return {
			code: "UNKNOWN_ROLE",
			message: `role "${svc.role}" is outside the closed DP02 set (want ${ROLES.join("|")}) — widening the role set is a truth change: idea → mirror → /goal`,
		};
	}

	const base = {
		service: svc.name,
		role: svc.role,
		environment: binding.environment,
	};

	if (binding.managed || svc.role === "connector") {
		const v = managedVar(svc.name);
		return {
			...base,
			mode: "managed_url",
			endpoint_pattern: `\${${v}}`,
			env_vars: v,
		};
	}
	if (svc.role === "server" && binding.network === "traefik_default") {
		return {
			...base,
			mode: "traefik_url",
			// biome-ignore lint/suspicious/noTemplateCurlyInString: literal env-var reference, never a value.
			endpoint_pattern: "https://${APP_SUBDOMAIN}.${DOMAIN}",
			env_vars: "APP_SUBDOMAIN,DOMAIN",
		};
	}
	return {
		...base,
		mode: "docker_internal",
		endpoint_pattern: `${containerHost(svc)}:${svc.internal_port}`,
		env_vars: "APP_NAME",
	};
}

/**
 * DEMO_SERVICES — the representative below-the-line demo stack the
 * /environments matrix displays (twin of Go connresolve.DemoManifest():
 * the SPEC-stack-2026 palette). A demo projection input — never a source.
 */
export const DEMO_SERVICES: readonly StackService[] = [
	{ name: "server", role: "server", internal_port: 3000 },
	{ name: "db", role: "datastore", internal_port: 5432 },
	{ name: "cache", role: "cache", internal_port: 6379 },
	{ name: "pooler", role: "pooler", internal_port: 6432 },
	{ name: "workflows", role: "workflow", internal_port: 8000 },
	{ name: "crm", role: "connector", internal_port: 443 },
];

/** resolveFor — the demo services resolved for ONE environment (name order). */
export function resolveFor(env: string): (Resolution | ConnRefusal)[] {
	return [...DEMO_SERVICES]
		.sort((a, b) => (a.name < b.name ? -1 : 1))
		.map((s) => resolveConnection(s, env));
}

/**
 * demoMatrix — every demo service × the five closed environments, in the
 * exact Go order (environments canonical, services name-sorted). Throws on a
 * refusal (the demo inputs are inside the closed sets by construction).
 */
export function demoMatrix(): Resolution[] {
	const out: Resolution[] = [];
	for (const env of ENVIRONMENTS) {
		for (const r of resolveFor(env)) {
			if (isConnRefusal(r)) {
				throw new Error(`${r.code}: ${r.message}`);
			}
			out.push(r);
		}
	}
	return out;
}

// ---------------------------------------------------------------------------
// Canonicalization + content address (records.Canonicalize/Hash twin — S02).
// ---------------------------------------------------------------------------

function encodeCanonical(v: unknown): string {
	if (v === null) return "null";
	if (Array.isArray(v)) {
		return `[${v.map(encodeCanonical).join(",")}]`;
	}
	if (typeof v === "object") {
		const keys = Object.keys(v as Record<string, unknown>).sort();
		const parts = keys.map(
			(k) =>
				`${JSON.stringify(k)}:${encodeCanonical((v as Record<string, unknown>)[k])}`,
		);
		return `{${parts.join(",")}}`;
	}
	return JSON.stringify(v);
}

/** canonicalDemoMatrix — the S02-canonical bytes of the demo matrix. */
export function canonicalDemoMatrix(): string {
	return encodeCanonical({ matrix: demoMatrix() });
}

async function sha256hex(s: string): Promise<string> {
	const { createHash } = await import("node:crypto");
	return createHash("sha256").update(s, "utf8").digest("hex");
}

/**
 * hashDemoMatrix — the content address of the canonical demo matrix. MUST
 * equal the Go-authoritative address (pinned in connections.test.ts + the
 * e2e) — any one-byte divergence reds the vitest mirror.
 */
export async function hashDemoMatrix(): Promise<string> {
	return sha256hex(canonicalDemoMatrix());
}
