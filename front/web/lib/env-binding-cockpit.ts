/**
 * env-binding-cockpit.ts — the DP09 PURE cockpit reducer for the
 * /environments route (ROADMAP-provisioning-deploy EPIC B): « déclarer/éditer
 * un binding d'environnement » as propose → ChangeSet → approbation, and the
 * connection matrix recomputed as the PURE DP07 projection over the effective
 * bindings — never an estimation.
 *
 * THE MODEL (all pure, all deterministic — CLAUDE.md §6 determinism-first):
 *   - a BindingDraft is validated FAIL-CLOSED in the door: the DP06 A1 gate
 *     (prod + doltgres refused DOLTGRES_NOT_ALLOWED_IN_PROD), the closed
 *     environment/datastore/network sets, the declared allowed_datastores,
 *     and the DP08 classifier over the url_pattern (a hardcoded endpoint is
 *     refused with the DP08 closed reason — ${VAR} references only);
 *   - proposeBinding builds a CONTENT-ADDRESSED S20 envelope (spec_delta +
 *     mirror_delta TOGETHER — the completeness law) in status DRAFT: the
 *     screen PROPOSES, it never writes the kernel (the wall, §2);
 *   - approveBinding re-verifies the content address (a tampered proposal is
 *     refused PROPOSAL_ADDRESS_MISMATCH) then applies via the S20 state
 *     machine (only a DRAFT applies — NOT_DRAFT otherwise);
 *   - effectiveBindings overlays the APPLIED deltas on the DP06 declared
 *     table; cockpitMatrix re-resolves every demo service × the five closed
 *     environments through resolveWith — the binding-parameterized twin of
 *     DP07 resolveConnection, PARITY-PINNED ∀ (env × service) by the mirror
 *     env-binding-cockpit.test.ts: with zero applied ChangeSet the cockpit
 *     matrix hashes to the EXACT Go-authoritative DP07 address.
 *
 * THE WALL (CLAUDE.md §2): this module writes NOTHING. The cockpit's only
 * doors are the S58 gateway tools changeset_open / changeset_apply
 * (below-the-line routed); kernel_write is refused by the gateway with
 * GATEWAY_TRUTH_WRITE_NEEDS_CHANGESET (mirrored in the test + on screen).
 * The real apply lands through the changeset MCP / the aidos CLI — the
 * cockpit returns the envelope a human approval would apply.
 */

import { createHash } from "node:crypto";
import type { ChangeSet } from "./changeset";
import { apply as applyEnvelope } from "./changeset";
import type { ConnRefusal, Resolution, StackService } from "./connections";
import { DEMO_SERVICES, isKnownRole, ROLES } from "./connections";
import {
	classifyLiteral,
	DEMO_EMITTED_TREE,
	hashVerdict,
	type Reason,
	RULE,
	sense,
} from "./endpoint-fitness";
import type { Binding, Datastore, Environment } from "./environments";
import {
	bindings,
	ENVIRONMENTS,
	isKnownDatastore,
	validateDatastore,
} from "./environments";

/**
 * The CLOSED network set — exactly the values the DP06 declared table uses
 * (traefik_default = behind the reverse proxy, default = the local bridge,
 * managed = a managed cloud). Widening it is a truth change (idea → mirror →
 * /goal).
 */
export const NETWORKS = ["traefik_default", "default", "managed"] as const;
export type Network = (typeof NETWORKS)[number];

export function isKnownNetwork(n: string): n is Network {
	return (NETWORKS as readonly string[]).includes(n);
}

/** The editable fields of one environment's binding — the cockpit's form. */
export interface BindingDraft {
	environment: Environment | string;
	default_datastore: Datastore | string;
	/** ${VAR} REFERENCES only — never a value (the DP03–DP05 law, DP08-gated). */
	url_pattern: string;
	tls: boolean;
	network: Network | string;
	managed: boolean;
}

/** The closed refusal codes (DP06 reused + the DP09 package-local additions). */
export type CockpitRefusalCode =
	| "UNKNOWN_ENVIRONMENT"
	| "UNKNOWN_DATASTORE"
	| "DOLTGRES_NOT_ALLOWED_IN_PROD"
	| "UNKNOWN_NETWORK"
	| "DATASTORE_NOT_ALLOWED"
	| "HARDCODED_ENDPOINT_IN_BINDING"
	| "NOT_DRAFT"
	| "PROPOSAL_ADDRESS_MISMATCH"
	| "MALFORMED_PROPOSAL";

export interface CockpitRefusal {
	code: CockpitRefusalCode;
	message: string;
	/** set iff the refusal came from the DP08 classifier (the closed reasons). */
	reason?: Reason;
}

export function isCockpitRefusal(
	v:
		| { changeset: BindingChangeSet }
		| { applied: BindingChangeSet }
		| CockpitRefusal,
): v is CockpitRefusal {
	return "code" in v;
}

/**
 * One binding ChangeSet — the S20 envelope (NEVER forked: the exact
 * lib/changeset.ts shape) PLUS the full effective binding its spec_delta
 * would install. The envelope id IS the content address of the binding
 * (records.Hash motif, S02) — re-verified at approval.
 */
export interface BindingChangeSet {
	envelope: ChangeSet;
	binding: Binding;
}

/**
 * APPLIED_AT — the deterministic application stamp of the cockpit sandbox
 * (the real apply stamps the wall-clock server-side; the pure twin NEVER
 * reads a clock — same input ⇒ same output).
 */
export const APPLIED_AT = "phase-cockpit+1";

// ---------------------------------------------------------------------------
// Validation — the gates in the door (fail-closed, closed sets, DP06 + DP08).
// ---------------------------------------------------------------------------

/**
 * validateDraft — every gate, in canonical order: closed environment +
 * datastore (and the A1 prod-imposes-Postgres rule) via the DP06 twin, the
 * declared allowed_datastores, the closed network set, then the DP08
 * classifier over the url_pattern. Returns null when the draft is admissible.
 */
export function validateDraft(d: BindingDraft): CockpitRefusal | null {
	const a1 = validateDatastore(
		String(d.environment),
		String(d.default_datastore),
	);
	if (a1) return { code: a1.code, message: a1.message };
	const declared = bindings().find((b) => b.environment === d.environment);
	if (!declared) {
		// unreachable after the A1 gate — kept fail-closed, never guessed.
		return {
			code: "UNKNOWN_ENVIRONMENT",
			message: `environment "${d.environment}" is outside the closed set`,
		};
	}
	if (
		isKnownDatastore(String(d.default_datastore)) &&
		!declared.allowed_datastores.includes(d.default_datastore as Datastore)
	) {
		return {
			code: "DATASTORE_NOT_ALLOWED",
			message: `datastore "${d.default_datastore}" is not in the declared allowed set of ${declared.environment} (${declared.allowed_datastores.join("|")}) — widening it is a truth change: idea → mirror → /goal`,
		};
	}
	if (!isKnownNetwork(String(d.network))) {
		return {
			code: "UNKNOWN_NETWORK",
			message: `network "${d.network}" is outside the closed set (want ${NETWORKS.join("|")})`,
		};
	}
	const reason = classifyLiteral(d.url_pattern);
	// localhost stays legal on the LOCAL machine only — the declared table's
	// own shape (http://localhost:${APP_PORT}); everywhere else the DP08 rule
	// EMITTED_NO_HARDCODED_ENDPOINT holds verbatim.
	if (
		reason &&
		!(d.environment === "local" && reason === "localhost_literal")
	) {
		return {
			code: "HARDCODED_ENDPOINT_IN_BINDING",
			message: `the url_pattern carries a hardcoded endpoint (${reason}) — ${RULE}: env-var references only, the concrete value is resolved from the environment at deploy`,
			reason,
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

function sha256hex(s: string): string {
	return createHash("sha256").update(s, "utf8").digest("hex");
}

/** bindingAddress — the content address of one effective binding (the envelope id). */
function bindingAddress(b: Binding): string {
	return sha256hex(encodeCanonical({ binding: b }));
}

/** materialize — the full effective Binding a draft would install (allowed set kept declared). */
function materialize(d: BindingDraft, declared: Binding): Binding {
	return {
		environment: declared.environment,
		default_datastore: d.default_datastore as Datastore,
		allowed_datastores: [...declared.allowed_datastores],
		url_pattern: d.url_pattern,
		tls: d.tls,
		network: String(d.network),
		managed: d.managed,
	};
}

// ---------------------------------------------------------------------------
// Propose → ChangeSet → approval (the S20 envelope, content-addressed).
// ---------------------------------------------------------------------------

/**
 * proposeBinding — validate the draft fail-closed, then build the DRAFT S20
 * envelope: spec_delta (kernel/binding/<env>) + mirror_delta
 * (mirrors/binding/<env>) TOGETHER — a spec without its mirror is a monster.
 * The id is the content address of the materialized binding. PROPOSED only —
 * the screen never writes the kernel (the wall, §2).
 */
export async function proposeBinding(
	d: BindingDraft,
): Promise<{ changeset: BindingChangeSet } | CockpitRefusal> {
	const refusal = validateDraft(d);
	if (refusal) return refusal;
	const declared = bindings().find((b) => b.environment === d.environment);
	if (!declared) {
		return {
			code: "UNKNOWN_ENVIRONMENT",
			message: `environment "${d.environment}" is outside the closed set`,
		};
	}
	const binding = materialize(d, declared);
	const id = bindingAddress(binding);
	const envelope: ChangeSet = {
		id,
		label: `binding(${binding.environment}): declare/edit the environment binding`,
		status: "DRAFT",
		parentPhase: "phase-cockpit",
		specDelta: {
			kind: "refine",
			target: `kernel/binding/${binding.environment}`,
		},
		mirrorDelta: {
			kind: "refine",
			target: `mirrors/binding/${binding.environment}`,
		},
		reverts: null,
		appliedAt: null,
	};
	return { changeset: { envelope, binding } };
}

/**
 * approveBinding — the human approval applies the envelope via the S20 state
 * machine: the content address is RE-VERIFIED first (a tampered proposal is
 * refused PROPOSAL_ADDRESS_MISMATCH — the approval applies EXACTLY what was
 * proposed, or nothing); only a DRAFT applies (NOT_DRAFT otherwise). Returns
 * the APPLIED changeset. Pure — the screen still writes no truth (§2).
 */
export function approveBinding(
	cs: BindingChangeSet,
): { applied: BindingChangeSet } | CockpitRefusal {
	const tampered = verifyProposal(cs);
	if (tampered) return tampered;
	const { applied, block } = applyEnvelope(cs.envelope, APPLIED_AT);
	if (block) {
		return {
			code: block.code === "NOT_DRAFT" ? "NOT_DRAFT" : "MALFORMED_PROPOSAL",
			message: block.explanation,
		};
	}
	return { applied: { envelope: applied, binding: cs.binding } };
}

/**
 * verifyProposal — recompute the content address of the carried binding and
 * refuse a proposal whose envelope id no longer matches (anti-tamper: the
 * approval applies EXACTLY what was proposed, or nothing).
 */
export function verifyProposal(cs: BindingChangeSet): CockpitRefusal | null {
	const id = bindingAddress(cs.binding);
	if (id !== cs.envelope.id) {
		return {
			code: "PROPOSAL_ADDRESS_MISMATCH",
			message:
				"the proposal's content address no longer matches its envelope id — the carried binding was altered after propose; re-propose from the form (anti-overwrite §9: an approval applies exactly what was proposed)",
		};
	}
	return null;
}

// ---------------------------------------------------------------------------
// The recomputed projection — effective bindings × the DP07 pure resolution.
// ---------------------------------------------------------------------------

/**
 * effectiveBindings — the DP06 declared table with every APPLIED binding
 * ChangeSet overlaid (apply order, last wins per environment). DRAFT /
 * REVERTED envelopes change NOTHING (only an applied truth moves the
 * projection).
 */
export function effectiveBindings(applied: BindingChangeSet[]): Binding[] {
	const table = bindings();
	for (const cs of applied) {
		if (cs.envelope.status !== "APPLIED") continue;
		const i = table.findIndex((b) => b.environment === cs.binding.environment);
		if (i >= 0) {
			table[i] = {
				...cs.binding,
				allowed_datastores: [...cs.binding.allowed_datastores],
			};
		}
	}
	return table;
}

/** managedVar — the S91 secret-store env-var reference (DP07 twin, verbatim). */
function managedVar(name: string): string {
	return `${name.toUpperCase().replace(/[^A-Z0-9]/g, "_")}_MANAGED_URL`;
}

/** containerHost — the /data/dockers container-name convention (DP07 twin, verbatim). */
function containerHost(svc: StackService): string {
	// biome-ignore lint/suspicious/noTemplateCurlyInString: the host is the LITERAL env-var reference (never a value) — the DP03–DP05 law.
	if (svc.role === "server") return "${APP_NAME}";
	return `\${APP_NAME}-${svc.name}`;
}

/**
 * resolveWith — the binding-PARAMETERIZED twin of DP07 resolveConnection
 * (lib/connections.ts ⇄ Go back/runtime/connresolve): the SAME closed rules,
 * applied to an EFFECTIVE binding instead of the baked declared one. The
 * parity law (mirror, law 1) pins resolveWith(bindingsFor(env), svc) ≡
 * resolveConnection(svc, env) on the whole declared domain — the cockpit
 * matrix IS the DP07 projection, never an estimation.
 */
export function resolveWith(
	binding: Binding,
	svc: StackService,
): Resolution | ConnRefusal {
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
 * cockpitMatrix — every demo service × the five closed environments resolved
 * over the EFFECTIVE bindings, in the exact DP07 order (environments
 * canonical, services name-sorted). Throws on a refusal (the demo inputs are
 * inside the closed sets by construction).
 */
export function cockpitMatrix(applied: BindingChangeSet[]): Resolution[] {
	const eff = effectiveBindings(applied);
	const services = [...DEMO_SERVICES].sort((a, b) =>
		a.name < b.name ? -1 : 1,
	);
	const out: Resolution[] = [];
	for (const env of ENVIRONMENTS) {
		const binding = eff.find((b) => b.environment === env);
		if (!binding) continue; // unreachable: eff covers the closed set.
		for (const svc of services) {
			const r = resolveWith(binding, svc);
			if ("code" in r) {
				throw new Error(`${r.code}: ${r.message}`);
			}
			out.push(r);
		}
	}
	return out;
}

/**
 * hashCockpitMatrix — the content address of the recomputed matrix, in the
 * SAME canonical form as DP07 hashDemoMatrix: with ZERO applied ChangeSet it
 * MUST equal the Go-authoritative DP07 demo-matrix address (mirror, law 2).
 */
export async function hashCockpitMatrix(
	applied: BindingChangeSet[],
): Promise<string> {
	return sha256hex(encodeCanonical({ matrix: cockpitMatrix(applied) }));
}

// ---------------------------------------------------------------------------
// The DP08 sensor status the cockpit displays (pure re-sense, Go-pinned).
// ---------------------------------------------------------------------------

export interface SensorStatus {
	rule: string;
	state: "green" | "red";
	findings: number;
	/** the content address of the verdict — Go-pinned GREEN on the demo tree. */
	address: string;
}

/**
 * sensorStatus — re-sense the canonical DP08 demo emitted tree and return
 * the verdict's state + Go-pinned content address. A pure read — the
 * action-capable sensor sandbox (inject/remove/measure) lives on
 * /endpoints-fitness (DP08's own screen).
 */
export function sensorStatus(): SensorStatus {
	const v = sense(DEMO_EMITTED_TREE);
	return {
		rule: v.rule,
		state: v.state,
		findings: v.findings.length,
		address: hashVerdict(v),
	};
}
