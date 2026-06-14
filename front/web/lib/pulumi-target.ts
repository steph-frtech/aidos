/**
 * pulumi-target.ts — the PURE TS twin of the authoritative Go emitter
 * `back/runtime/honoemit/pulumi_stack_target.go` (DP33 — PORTABILITÉ
 * FUTURE-CLOUD : le MÊME StackManifest, deux CIBLES, zéro réécriture).
 *
 * L'intention (DP33, clôture EPIC G + la piste DP) : prouver que le MÊME
 * StackManifest se projette vers future_cloud SANS réécrire la déclaration. Le
 * self-hosted (@pulumi/docker) et le cloud (provider managé) sont deux
 * PROJECTIONS de la même source ; aucune divergence de déclaration. « Une
 * source → N projections » (ADR 0043 amendé, EPIC G).
 *
 * LA CIBLE EST UNE DIMENSION, PAS UNE NOUVELLE SOURCE (le mur, §2).
 * emitPulumiStackTarget ajoute un paramètre Target ∈ {self_hosted, future_cloud}
 * à l'émetteur PROUVÉ emitPulumi (le twin Pulumi @pulumi/docker existant,
 * hono-emitter.ts) :
 *   - self_hosted → délègue VERBATIM à emitPulumi (le @pulumi/docker prouvé) ;
 *     byte-identique — la cible cloud est PUREMENT ADDITIVE (anti-overwrite §9) ;
 *   - future_cloud → projette une variante CLOUD : les services MANAGÉS
 *     (datastore/bus/cache/pooler/workflow) se résolvent en managed_url
 *     (RÉUTILISE la résolution DP07 — <NAME>_MANAGED_URL) au lieu d'un
 *     docker.Container ; les services APPLICATIFS (server/interpreter)
 *     deviennent une ressource cloud représentative (@pulumi/cloud.Service ;
 *     le server porte le domaine HTTPS).
 *
 * DÉTERMINISME-FIRST (CLAUDE.md §6/§8). emitPulumiStackTarget est une FONCTION
 * PURE, TOTALE, byte-stable de (manifest, target) — aucune horloge, aucun RNG,
 * ordre de service canonique (name-trié). La SOURCE StackManifest n'est JAMAIS
 * mutée : la projection la LIT seulement (le miroir de source-invariance,
 * pulumi-target.test.ts, le scelle). Jamais un LLM : la résolution managed_url
 * est la règle DP07 (close), le mapping rôle→managé est une appartenance close.
 * THE GO CODE IS AUTHORITATIVE ; ce twin reproduit la matrice kind×target pour
 * l'écran (le sélecteur de cible recalcule la projection depuis la MÊME source).
 *
 * THE WALL (CLAUDE.md §2) : émettre une cible est une projection below-the-line
 * — ce module n'écrit RIEN ; le StackManifest source reste au-dessus de la
 * ligne (DP02). Réutilise emitPulumi/DP07 — il ne forke rien.
 */

import {
	type BlockReason,
	emitPulumi,
	isBlocked,
	type ServiceRole,
	type StackManifest,
	validateManifest,
} from "./hono-emitter";

/**
 * Target is the CLOSED deployment-target dimension DP33 adds to the Pulumi stack
 * emitter: the same StackManifest projects to EITHER target without a
 * re-declaration. An unknown target is refused (the honesty rule), never guessed.
 */
export type Target = "self_hosted" | "future_cloud";

/** The @pulumi/docker self-hosted projection (the proven emitPulumi). */
export const TARGET_SELF_HOSTED: Target = "self_hosted";
/** The managed-cloud projection (scope.EnvFutureCloud, DP06): managed services → managed_url. */
export const TARGET_FUTURE_CLOUD: Target = "future_cloud";

/** The closed deployment-target set, canonical order (declared, never from map iteration). */
const TARGET_ORDER: Target[] = [TARGET_SELF_HOSTED, TARGET_FUTURE_CLOUD];

/** targets returns the closed deployment-target set in canonical order. */
export function targets(): Target[] {
	return [...TARGET_ORDER];
}

/** isTarget reports whether t is a member of the closed deployment-target set. */
export function isTarget(t: string): t is Target {
	return (TARGET_ORDER as readonly string[]).includes(t);
}

/**
 * cloudManagedRoles is the CLOSED set of roles that resolve to a MANAGED cloud
 * resource in future_cloud (datastore→RDS-like, bus→managed bus, cache→managed
 * cache, pooler/workflow→managed). Declared, never learned (§8). A role NOT in
 * this set is an APP service (server, interpreter) projected as cloud compute.
 */
const CLOUD_MANAGED_ROLES: Record<string, boolean> = {
	datastore: true,
	bus: true,
	cache: true,
	pooler: true,
	workflow: true,
};

/** isCloudManaged reports whether a service is MANAGED in the future_cloud projection. */
export function isCloudManaged(role: ServiceRole): boolean {
	return CLOUD_MANAGED_ROLES[role] === true;
}

/** The cloud domain suffix the future_cloud server is routed under (the twin of stackDomainSuffix). */
const CLOUD_DOMAIN_SUFFIX = "sagedesk.fr";

/**
 * managedVar derives the S91 secret-store env-var reference for a managed
 * service: <NAME>_MANAGED_URL with the name upper-snaked. Deterministic, total —
 * the EXACT twin of Go connresolve.managedVar (DP07).
 */
export function managedVar(name: string): string {
	const up = name.toUpperCase();
	let out = "";
	for (const ch of up) {
		out += /[A-Z0-9]/.test(ch) ? ch : "_";
	}
	return `${out}_MANAGED_URL`;
}

/** tsIdent — a safe TS identifier for a service name (twin of Go tsIdent / hono-emitter tsIdent). */
function tsIdent(name: string): string {
	let out = "";
	for (let i = 0; i < name.length; i++) {
		const ch = name[i];
		if (/[a-zA-Z_]/.test(ch)) out += ch;
		else if (/[0-9]/.test(ch)) out += (i === 0 ? "_" : "") + ch;
		else out += "_";
	}
	return out || "_";
}

/** byNameServices canonicalises input order (name-sorted) so bytes never leak it. */
function byNameServices<T extends { name: string }>(s: T[]): T[] {
	return [...s].sort((a, b) =>
		a.name < b.name ? -1 : a.name > b.name ? 1 : 0,
	);
}

const MARKER = "CODE GENERATED BY AIDOS — DO NOT EDIT";

/** A small deterministic FNV-1a digest for the preview header (display only). */
export function digest(s: string): string {
	let h = 0x811c9dc5;
	for (let i = 0; i < s.length; i++) {
		h ^= s.charCodeAt(i);
		h = Math.imul(h, 0x01000193) >>> 0;
	}
	return h.toString(16).padStart(8, "0");
}

function header(body: string): string {
	return `// ${MARKER}. source: ${digest(body)}\n`;
}

/**
 * One managed-service resolution surfaced to the screen — the future_cloud
 * managed_url binding of a service (DP07 reused). The url is a ${<NAME>_MANAGED_URL}
 * REFERENCE, never a value (no secret leaks into the source).
 */
export interface ManagedResolution {
	service: string;
	role: ServiceRole;
	/** the managed connection mode (always "managed_url" in future_cloud). */
	mode: "managed_url";
	/** the ${<NAME>_MANAGED_URL} secret-store reference (the env var the boot reads). */
	url: string;
}

/**
 * A target projection of the SAME StackManifest — the deterministic output the
 * screen recalculates when the operator toggles the deployment target. The
 * `sourceHash` is the content address of the SOURCE manifest: it is IDENTICAL
 * across targets (the source-invariance property); the `program` BYTES differ.
 */
export interface TargetProjection {
	target: Target;
	/** the @pulumi/<provider> the projection imports ("@pulumi/docker" | "@pulumi/cloud"). */
	provider: "@pulumi/docker" | "@pulumi/cloud";
	/** the emitted Pulumi/TS program (index.ts) — the PURE projection of the source. */
	program: string;
	/** the content address of the SOURCE manifest — INVARIANT across targets (the capital property). */
	sourceHash: string;
	/** the content address of the OUTPUT program bytes — DIFFERS between targets. */
	outputHash: string;
	/** the managed-service resolutions (future_cloud only; empty for self_hosted). */
	managed: ManagedResolution[];
}

async function sha256hex(s: string): Promise<string> {
	const { createHash } = await import("node:crypto");
	return createHash("sha256").update(s, "utf8").digest("hex");
}

/**
 * sourceHash — the content address of the SOURCE StackManifest, INVARIANT across
 * targets. Canonicalises the manifest (services name-sorted) so the address never
 * leaks input order, then hashes — the projection READS this, it never re-declares
 * the source. (The exact triple is hashed: the kind discriminator + the canonical
 * manifest body. A target is NOT part of the source address — that is precisely
 * the source-invariance the mirror pins.)
 */
export async function sourceHash(m: StackManifest): Promise<string> {
	const canonical = {
		kind: "stack_manifest",
		app: m.app,
		network: { name: m.network.name, external: m.network.external },
		services: byNameServices(m.services).map((s) => ({
			image: s.image,
			internalPort: s.internalPort,
			name: s.name,
			role: s.role,
		})),
	};
	return sha256hex(JSON.stringify(canonical));
}

/**
 * emitFutureCloudProgram renders the managed-cloud Pulumi/TS program for the
 * stack: each MANAGED service (datastore/bus/cache/pooler/workflow) is a
 * managed-URL reference (DP07; resolved at boot from the secret store), each APP
 * service (server/interpreter) a representative @pulumi/cloud.Service. The server
 * carries the public HTTPS domain. PURE: same canonical manifest → same bytes.
 */
function renderFutureCloudProgram(
	m: StackManifest,
	src: string,
): { program: string; managed: ManagedResolution[] } {
	const svcs = byNameServices(m.services);
	const stack = m.app;
	const domain = `${stack}.${CLOUD_DOMAIN_SUFFIX}`;

	const out: string[] = [];
	out.push(
		"// DP33 future_cloud infra program (Pulumi/functional TS, ADR 0043 amended). The SAME",
		"// StackManifest as the self-hosted target — projected to the managed cloud: MANAGED",
		"// services (datastore/bus/cache/pooler/workflow) resolve to managed_url (DP07); APP",
		`// services become representative cloud resources, routed at https://${domain}.`,
		"// PORTABILITY BY PROJECTION, NEVER BY REWRITE — one source, N targets.",
		'import * as cloud from "@pulumi/cloud";',
		"",
		"export function program() {",
	);

	// MANAGED services first (canonical order): each a managed_url reference resolved at boot (DP07).
	const managed: ManagedResolution[] = [];
	const managedVars: string[] = [];
	for (const s of svcs) {
		if (!isCloudManaged(s.role)) continue;
		const v = tsIdent(s.name);
		const envVar = managedVar(s.name);
		managedVars.push(v);
		managed.push({
			service: s.name,
			role: s.role,
			mode: "managed_url",
			url: `\${${envVar}}`,
		});
		out.push(
			`\t// ${s.name} (role ${s.role}) is MANAGED in future_cloud: resolved to managed_url (DP07).`,
			`\tconst ${v} = { service: ${JSON.stringify(s.name)}, mode: "managed_url", url: process.env[${JSON.stringify(envVar)}] };`,
		);
	}
	if (managedVars.length > 0) out.push("");

	// APP services (canonical order): a representative cloud compute resource. The server carries the
	// public route (the cloud provider's HTTPS endpoint); every other app service is internal compute.
	const appVars: string[] = [];
	for (const s of svcs) {
		if (isCloudManaged(s.role)) continue;
		const v = tsIdent(s.name);
		appVars.push(v);
		const cname = `${stack}-${s.name}`;
		out.push(
			`\tconst ${v} = new cloud.Service(${JSON.stringify(s.name)}, {`,
			`\t\timage: ${JSON.stringify(s.image)},`,
			`\t\tname: ${JSON.stringify(cname)},`,
		);
		out.push(`\t\tport: ${s.internalPort},`);
		if (s.role === "server") {
			out.push(`\t\tdomain: ${JSON.stringify(domain)},`);
		}
		out.push("\t});");
	}
	if (appVars.length > 0) out.push("");

	out.push(
		`\treturn { resources: { ${appVars.join(", ")} }, managed: { ${managedVars.join(", ")} } };`,
		"}",
		"",
		"// The Pulumi entrypoint: instantiate the resource graph + export the stack outputs.",
		"export const resources = program();",
		`export const url = ${JSON.stringify(`https://${domain}`)};`,
	);

	const body = `${out.join("\n").replace(/\n+$/, "")}\n`;
	return { program: header(src) + body, managed };
}

/**
 * emitPulumiStackTarget is the DP33 target-dimensioned stack emitter: the SAME
 * StackManifest → the requested deployment target, deterministically, WITHOUT
 * modifying the source. For self_hosted it delegates VERBATIM to emitPulumi
 * (byte-identical, the proven @pulumi/docker); for future_cloud it renders the
 * managed-cloud projection (managed services → managed_url, DP07 reused; app
 * services → representative cloud resources). A malformed input or an unknown
 * target is a typed BlockReason (the honesty rule — a cible inconnue / a no-server
 * manifest is refused, never guessed).
 *
 * THE SOURCE IS READ, NEVER MUTATED: the same manifest object is passed to both
 * targets; the function never writes back to it. Both targets share ONE sourceHash
 * (the content address of the source); their `program` bytes differ — exactly the
 * "one source → N projections" property.
 */
export async function emitPulumiStackTarget(
	m: StackManifest,
	target: string,
): Promise<TargetProjection | BlockReason> {
	if (!isTarget(target)) {
		return {
			code: "UNKNOWN_TARGET",
			severity: "blocking",
			explanation: `Cible de déploiement « ${target} » hors du jeu fermé [${TARGET_ORDER.join(" ")}] — une cible est déclarée, jamais devinée (DP33). La portabilité se fait par PROJECTION, jamais par réécriture.`,
			how_to_fix: [
				`choose_a_known_target : sélectionnez self_hosted (@pulumi/docker) ou future_cloud (cloud managé) — le MÊME StackManifest se projette vers l'une OU l'autre sans réécrire la déclaration.`,
			],
		};
	}

	const bad = validateManifest(m);
	if (bad) return bad;

	const src = await sourceHash(m);

	if (target === TARGET_SELF_HOSTED) {
		// The proven self-hosted emitter, untouched (anti-overwrite §9): the cloud variant is ADDITIVE.
		const program = emitPulumi(m);
		if (isBlocked(program)) return program;
		return {
			target: TARGET_SELF_HOSTED,
			provider: "@pulumi/docker",
			program,
			sourceHash: src,
			outputHash: await sha256hex(program),
			managed: [],
		};
	}

	// --- future_cloud: the managed-cloud projection of the SAME source. ---
	const { program, managed } = renderFutureCloudProgram(m, src);
	return {
		target: TARGET_FUTURE_CLOUD,
		provider: "@pulumi/cloud",
		program,
		sourceHash: src,
		outputHash: await sha256hex(program),
		managed,
	};
}

/** isTargetProjection — narrow the emitPulumiStackTarget result to its projection (not a BlockReason). */
export function isTargetProjection(
	v: TargetProjection | BlockReason,
): v is TargetProjection {
	return !isBlocked(v);
}
