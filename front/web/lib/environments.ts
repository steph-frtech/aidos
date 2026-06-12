/**
 * environments.ts — the PURE TS twin of the authoritative Go projection
 * `back/runtime/envbindings` (DP06 — the per-environment connection bindings
 * over the WIDENED closed environment set, ROADMAP-provisioning-deploy EPIC B,
 * ADR 0065).
 *
 * THE MODEL: Environment REUSES scope.Environment (S15) — the closed FIVE-member
 * set {prod, staging, dev, local, future_cloud} (the S15 trio preserved as the
 * canonical-order prefix, the two DP06 members APPENDED — additive, ADR 0065).
 * Each environment DECLARES its connection bindings (default + allowed
 * datastores, ${VAR} URL pattern, TLS, network, managed) as a below-the-line
 * projection — never a source.
 *
 * THE A1 GATE (ADR 0065, addendum ADR 0006, SPEC-stack-2026 verbatim:
 * « PostgreSQL = la prod. Doltgres = hors prod uniquement. »): prod + doltgres
 * is REFUSED with the closed code DOLTGRES_NOT_ALLOWED_IN_PROD.
 *
 * DETERMINISM-FIRST (CLAUDE.md §6/§8): the GO CODE IS AUTHORITATIVE; this twin
 * is byte-parity-pinned to it (GO_BINDINGS_HASH in environments.test.ts — the
 * canonical projection must hash to the EXACT address the Go side measured).
 * Canonical form = records.Canonicalize (S02, never forked): keys sorted
 * recursively, no insignificant whitespace; address = sha256 hex.
 *
 * THE WALL (CLAUDE.md §2): this module never writes — widening the closed
 * environment set WAS the truth change (idea → mirror → /goal, ADR 0065); the
 * /environments route only READS the declared bindings and RE-MEASURES.
 */

/**
 * The CLOSED environment set — scope.Environments() (S15 + DP06/ADR 0065), in
 * canonical order: the S15 trio is the PREFIX, the DP06 members are APPENDED.
 */
export const ENVIRONMENTS = [
	"prod",
	"staging",
	"dev",
	"local",
	"future_cloud",
] as const;
export type Environment = (typeof ENVIRONMENTS)[number];

/** The CLOSED datastore set (ADR 0006/0065). */
export const DATASTORES = ["postgres", "doltgres"] as const;
export type Datastore = (typeof DATASTORES)[number];

/** One environment's declared connection binding (twin of Go Binding). */
export interface Binding {
	environment: Environment;
	default_datastore: Datastore;
	allowed_datastores: Datastore[];
	/** ${VAR} REFERENCES only — never a value (the DP03–DP05 law). */
	url_pattern: string;
	tls: boolean;
	network: string;
	managed: boolean;
}

/** The closed refusal codes (package-local, DP02 motif) — mirrors Go. */
export type RefusalCode =
	| "UNKNOWN_ENVIRONMENT"
	| "UNKNOWN_DATASTORE"
	| "DOLTGRES_NOT_ALLOWED_IN_PROD";

export interface Refusal {
	code: RefusalCode;
	message: string;
}

export function isKnownEnvironment(e: string): e is Environment {
	return (ENVIRONMENTS as readonly string[]).includes(e);
}

export function isKnownDatastore(d: string): d is Datastore {
	return (DATASTORES as readonly string[]).includes(d);
}

/**
 * The DECLARED bindings table — the exact twin of the Go-authoritative
 * back/runtime/envbindings table, in scope.Environments() canonical order.
 * Declared, never learned (§8). ${VAR} references only.
 */
const BINDINGS: readonly Binding[] = [
	{
		environment: "prod",
		default_datastore: "postgres",
		allowed_datastores: ["postgres"],
		// biome-ignore lint/suspicious/noTemplateCurlyInString: the binding carries the LITERAL env-var reference (never a value) — the DP03–DP05 law.
		url_pattern: "https://${APP_NAME}.${DOMAIN}",
		tls: true,
		network: "traefik_default",
		managed: false,
	},
	{
		environment: "staging",
		default_datastore: "doltgres",
		allowed_datastores: ["postgres", "doltgres"],
		// biome-ignore lint/suspicious/noTemplateCurlyInString: literal env-var reference, never a value.
		url_pattern: "https://${APP_NAME}-staging.${DOMAIN}",
		tls: true,
		network: "traefik_default",
		managed: false,
	},
	{
		environment: "dev",
		default_datastore: "doltgres",
		allowed_datastores: ["postgres", "doltgres"],
		// biome-ignore lint/suspicious/noTemplateCurlyInString: literal env-var reference, never a value (EXIGENCE 1: https://<projet>-dev.sagedesk.fr is resolved from ${DOMAIN} at deploy, never hardcoded).
		url_pattern: "https://${APP_NAME}-dev.${DOMAIN}",
		tls: true,
		network: "traefik_default",
		managed: false,
	},
	{
		environment: "local",
		default_datastore: "doltgres",
		allowed_datastores: ["postgres", "doltgres"],
		// biome-ignore lint/suspicious/noTemplateCurlyInString: literal env-var reference, never a value.
		url_pattern: "http://localhost:${APP_PORT}",
		tls: false,
		network: "default",
		managed: false,
	},
	{
		environment: "future_cloud",
		default_datastore: "postgres",
		allowed_datastores: ["postgres", "doltgres"],
		// biome-ignore lint/suspicious/noTemplateCurlyInString: literal env-var reference, never a value.
		url_pattern: "${MANAGED_URL}",
		tls: true,
		network: "managed",
		managed: true,
	},
];

/** bindings — the five declared bindings (fresh copies, the table is frozen). */
export function bindings(): Binding[] {
	return BINDINGS.map((b) => ({
		...b,
		allowed_datastores: [...b.allowed_datastores],
	}));
}

/** bindingsFor — the binding for env, or an UNKNOWN_ENVIRONMENT refusal. */
export function bindingsFor(env: string): Binding | Refusal {
	const found = BINDINGS.find((b) => b.environment === env);
	if (!found) {
		return {
			code: "UNKNOWN_ENVIRONMENT",
			message: `environment "${env}" is outside the closed set (want prod|staging|dev|local|future_cloud — ADR 0065); widening the set is a truth change: idea → mirror → /goal`,
		};
	}
	return { ...found, allowed_datastores: [...found.allowed_datastores] };
}

export function isRefusal(v: Binding | Refusal): v is Refusal {
	return "code" in v;
}

/**
 * validateDatastore — the PURE A1 gate, the exact twin of Go
 * envbindings.ValidateDatastore: unknown environment refused, unknown
 * datastore refused, and prod + doltgres refused (DOLTGRES_NOT_ALLOWED_IN_PROD,
 * ADR 0065). Returns null when the pair is admitted.
 */
export function validateDatastore(env: string, ds: string): Refusal | null {
	if (!isKnownEnvironment(env)) {
		return {
			code: "UNKNOWN_ENVIRONMENT",
			message: `environment "${env}" is outside the closed set (want prod|staging|dev|local|future_cloud)`,
		};
	}
	if (!isKnownDatastore(ds)) {
		return {
			code: "UNKNOWN_DATASTORE",
			message: `datastore "${ds}" is outside the closed set (want postgres|doltgres)`,
		};
	}
	if (env === "prod" && ds === "doltgres") {
		return {
			code: "DOLTGRES_NOT_ALLOWED_IN_PROD",
			message:
				"prod imposes Postgres (SPEC-stack-2026: « PostgreSQL = la prod. Doltgres = hors prod uniquement. », ADR 0065 addendum to 0006) — pick postgres in prod, or deploy doltgres to local/dev/staging",
		};
	}
	return null;
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

/** canonicalBindings — the S02-canonical bytes of the whole projection. */
export function canonicalBindings(): string {
	return encodeCanonical({ bindings: bindings() });
}

async function sha256hex(s: string): Promise<string> {
	const { createHash } = await import("node:crypto");
	return createHash("sha256").update(s, "utf8").digest("hex");
}

/**
 * hashBindings — the content address of the canonical projection. MUST equal
 * the Go-authoritative address (pinned in environments.test.ts + the e2e) —
 * any one-byte divergence reds the vitest mirror.
 */
export async function hashBindings(): Promise<string> {
	return sha256hex(canonicalBindings());
}
