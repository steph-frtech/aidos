/**
 * stack-manifest.ts — the PURE TS twin of the authoritative Go Kernel source
 * `back/kernel/stackmanifest` (DP02 — the StackManifest engraved as a
 * first-class Kernel SOURCE, ROADMAP-provisioning-deploy EPIC A).
 *
 * DETERMINISM-FIRST (CLAUDE.md §6/§8): validation, canonicalization and
 * content-addressing are pure functions — the GO CODE IS AUTHORITATIVE; this
 * twin is byte-parity-pinned to it by the vitest mirror (the seeded Example
 * manifest must hash to the EXACT hash the Go side measured —
 * GO_MANIFEST_HASH in stack-manifest.test.ts). Any one-byte divergence reds.
 *
 * Canonical form = records.Canonicalize (S02 reused, never forked): the JSON
 * body with object keys sorted lexicographically (recursively), no
 * insignificant whitespace, empty/omitted fields dropped (Go omitempty).
 * Content address = sha256 hex of those bytes (records.Hash).
 *
 * THE WALL (CLAUDE.md §2): stack_manifest is ABOVE-the-line truth. This module
 * never writes — the Workbench /stack-manifest route only READS the seeded
 * manifest and RE-MEASURES (validate + hash); engraving a manifest flows
 * through idea → mirror → /goal → human approval, never a screen.
 */

/** The CLOSED role set (DP02 — an unknown role is refused, never guessed). */
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
export type Role = (typeof ROLES)[number];

/** The CLOSED profile set (SPEC-stack-2026 §one-shot, compose à profils). */
export const PROFILES = [
	"core",
	"docs",
	"observability",
	"qa",
	"git",
	"tickets",
	"connectors",
	"non-prod",
	"full",
] as const;
export type Profile = (typeof PROFILES)[number];

export interface Service {
	name: string;
	role: string;
	/** container image — empty when the service is EMITTED (DP03+). */
	image?: string;
	internal_port: number;
	profile: string;
	healthcheck?: string;
	depends_on?: string[];
}

export interface Volume {
	name: string;
	/** ENV VAR REFERENCE for the bind device — never a hardcoded path. */
	device_var: string;
}

export interface Network {
	name: string;
	external: boolean;
}

/** The DP02 first-class Kernel source: the DECLARED stack topology. */
export interface StackManifest {
	app: string;
	services: Service[];
	volumes?: Volume[];
	network: Network;
	connector_scopes?: string[];
}

/** The closed refusal codes (DP02 done-criteria) — mirrors Go. */
export type RefusalCode =
	| "STACK_NAME_REQUIRED"
	| "STACK_HAS_NO_SERVER"
	| "UNKNOWN_SERVICE_ROLE"
	| "DUPLICATE_INTERNAL_PORT"
	| "UNKNOWN_PROFILE"
	| "SERVICE_NAME_REQUIRED"
	| "DUPLICATE_SERVICE_NAME";

export interface Refusal {
	code: RefusalCode;
	message: string;
}

export function isKnownRole(r: string): r is Role {
	return (ROLES as readonly string[]).includes(r);
}

export function isKnownProfile(p: string): p is Profile {
	return (PROFILES as readonly string[]).includes(p);
}

/**
 * validate — the PURE total validator, the exact twin of Go
 * stackmanifest.Validate: name required, services named + unique, roles and
 * profiles inside their closed sets, internal ports unique, ≥1 role=server.
 * Returns null when valid, a Refusal (code + actionable message) otherwise.
 */
export function validate(m: StackManifest): Refusal | null {
	if (!m.app) {
		return {
			code: "STACK_NAME_REQUIRED",
			message: "the manifest must declare an app name",
		};
	}
	const seenNames = new Set<string>();
	const seenPorts = new Map<number, string>();
	let hasServer = false;
	for (const s of m.services) {
		if (!s.name) {
			return {
				code: "SERVICE_NAME_REQUIRED",
				message: "every service must be named",
			};
		}
		if (seenNames.has(s.name)) {
			return {
				code: "DUPLICATE_SERVICE_NAME",
				message: `service "${s.name}" declared twice`,
			};
		}
		seenNames.add(s.name);
		if (!isKnownRole(s.role)) {
			return {
				code: "UNKNOWN_SERVICE_ROLE",
				message: `service "${s.name}": role "${s.role}" is outside the closed set [${ROLES.join(" ")}]`,
			};
		}
		if (!isKnownProfile(s.profile)) {
			return {
				code: "UNKNOWN_PROFILE",
				message: `service "${s.name}": profile "${s.profile}" is outside the closed set [${PROFILES.join(" ")}]`,
			};
		}
		const prior = seenPorts.get(s.internal_port);
		if (prior !== undefined) {
			return {
				code: "DUPLICATE_INTERNAL_PORT",
				message: `services "${prior}" and "${s.name}" both declare internal port ${s.internal_port}`,
			};
		}
		seenPorts.set(s.internal_port, s.name);
		if (s.role === "server") {
			hasServer = true;
		}
	}
	if (!hasServer) {
		return {
			code: "STACK_HAS_NO_SERVER",
			message: "the stack must declare at least one role=server service",
		};
	}
	return null;
}

/** drops Go-omitempty values: "", undefined, empty arrays. */
function compact(v: unknown): unknown {
	if (Array.isArray(v)) {
		return v.map(compact);
	}
	if (v !== null && typeof v === "object") {
		const out: Record<string, unknown> = {};
		for (const [k, val] of Object.entries(v as Record<string, unknown>)) {
			if (val === undefined || val === "") continue;
			if (Array.isArray(val) && val.length === 0) continue;
			out[k] = compact(val);
		}
		return out;
	}
	return v;
}

/** encodeCanonical — keys sorted recursively, no whitespace (records.Canonicalize twin). */
function encodeCanonical(v: unknown): string {
	if (Array.isArray(v)) {
		return `[${v.map(encodeCanonical).join(",")}]`;
	}
	if (v !== null && typeof v === "object") {
		const keys = Object.keys(v as Record<string, unknown>).sort();
		return `{${keys
			.map(
				(k) =>
					`${JSON.stringify(k)}:${encodeCanonical((v as Record<string, unknown>)[k])}`,
			)
			.join(",")}}`;
	}
	return JSON.stringify(v);
}

/**
 * canonicalBody — the canonical JSONB bytes of a VALID manifest: the AST plus
 * the kind discriminator "stack_manifest", keys sorted, omitempty applied.
 * Throws the Refusal of an invalid manifest (an invalid manifest never gets
 * an address — Go parity).
 */
export function canonicalBody(m: StackManifest): string {
	const refusal = validate(m);
	if (refusal) {
		throw new Error(`stackmanifest: ${refusal.code}: ${refusal.message}`);
	}
	return encodeCanonical(compact({ kind: "stack_manifest", ...m }));
}

async function sha256hex(s: string): Promise<string> {
	const { createHash } = await import("node:crypto");
	return createHash("sha256").update(s, "utf8").digest("hex");
}

/** hashManifest — records.Hash(records.Canonicalize(body)): the content address. */
export async function hashManifest(m: StackManifest): Promise<string> {
	return sha256hex(canonicalBody(m));
}

/** One content-addressed, append-only kernel.stack_manifest row (id == version == hash). */
export interface StackManifestRecord {
	id: string;
	body: string;
	version: string;
}

/** newRecord — the content-addressed record of a valid manifest (never written here). */
export async function newRecord(
	m: StackManifest,
): Promise<StackManifestRecord> {
	const body = canonicalBody(m);
	const h = await sha256hex(body);
	return { id: h, body, version: h };
}

/**
 * exampleManifest — the pinned reference manifest, the EXACT twin of Go
 * stackmanifest.Example(): the minimal /data/dockers-convention stack — one
 * reverse-proxied server, one datastore, the Go interpreter sidecar (profile
 * core, ADR 0040 D7), one named bind volume, the external traefik_default
 * network, one declared connector scope.
 */
export function exampleManifest(): StackManifest {
	return {
		app: "alphashop",
		services: [
			{
				name: "app",
				role: "server",
				image: "node:22-alpine",
				internal_port: 3000,
				profile: "core",
				healthcheck: "wget -q --spider http://localhost:3000/health",
				depends_on: ["postgres"],
			},
			{
				name: "postgres",
				role: "datastore",
				image: "postgres:17-alpine",
				internal_port: 5432,
				profile: "core",
				healthcheck: "pg_isready -U app",
			},
			{
				name: "interpreter",
				role: "interpreter",
				image: "",
				internal_port: 8973,
				profile: "core",
				healthcheck: "wget -q --spider http://localhost:8973/health",
			},
		],
		volumes: [{ name: "app_data", device_var: "APP_DATA_PATH" }],
		network: { name: "traefik_default", external: true },
		connector_scopes: ["postgres:read-only"],
	};
}
