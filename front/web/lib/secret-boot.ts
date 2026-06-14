/**
 * secret-boot — the DP32 twin (piste DP, EPIC G) of back/runtime/bootstrap/bootenv.go.
 * It BRANCHES S91 (the per-project secret store) onto the provisioning : the ENGRAVED boot
 * merge order resolves the emitted `.env.example` REFERENCES (DP04) into the CONCRETE boot
 * env, pulling each secret's value from the project-scoped store (S91 Get), then applying
 * the deploy-time overrides last.
 *
 * DETERMINISM-FIRST (CLAUDE.md §6/§8): mergeBootEnv is a PURE, TOTAL function of
 * (.env.example, store-state, projectId, overrides) — no clock, no rng, no map-iteration
 * leak (the layer order is the DECLARED constant BOOT_MERGE_ORDER, keys resolve in sorted
 * order). Same inputs → byte-identical env (the reproducibility mirror). The leak scan is
 * the SHARED S91 scanEmission (lib/secret-store) — code, never an LLM. The Go is the
 * AUTHORITATIVE engine (AES-256-GCM at rest, the project_id AAD bind); this twin reproduces
 * its verdicts so the Workbench /app-ops « Secrets » panel set/rotate/scan WITHOUT a backend
 * round-trip.
 *
 * THE WALL (CLAUDE.md §2): a secret is operational material, NEVER a truth. The secrets
 * live in the appliance/secret store at boot — never the truth-store, never git, never the
 * emitted source : the `.env.example` carries ONLY references (`<<from-secret-store>>`), and
 * the merge resolves them in memory — it NEVER mutates the emitted bytes. There is no raw
 * "read value" surface to the UI — a value only ever flows as a boot-time env var. The
 * isolation is the (project, name) scope (S91 scopeKey + the S55 RLS at persistence): a
 * secret of project A is invisible under project B and never appears in the emitted source.
 *
 * ANTI-DUPLICATION (CLAUDE.md §9): this REUSES lib/secret-store (SecretStore / scanEmission /
 * isClean / envVar) — the same S91 twin lib/backup already imports. The only DP32-proper
 * logic is the engraved merge order, the references-only property, and the rotation decision.
 */

import { createHash } from "node:crypto";
import {
	type Finding,
	isClean,
	type SecretStore,
	scanEmission,
} from "./secret-store";

// ── The reference placeholder (mirrors envemit.SecretPlaceholder) ────────────────

/**
 * SECRET_PLACEHOLDER is the EXACT reference the emitted `.env.example` (DP04) carries for a
 * secret key — the value lives encrypted + project-scoped in the S91 store and is injected
 * at boot. It is byte-identical to the Go envemit.SecretPlaceholder. A key whose value is
 * this placeholder is a SECRET REFERENCE that the boot merge MUST resolve.
 */
export const SECRET_PLACEHOLDER = "<<from-secret-store>>";

/**
 * DEPLOY_TIME_PLACEHOLDER is the documented deploy-time marker (e.g. APP_NAME) — NOT a
 * secret. It is carried forward (resolved by an override or left as the marker); it never
 * triggers a MISSING_SECRET_AT_BOOT (mirrors the Go DeployTimePlaceholder handling).
 */
export const DEPLOY_TIME_PLACEHOLDER = "<<deploy-time>>";

// ── The engraved merge order (mirrors bootenv.go MergeLayer / bootMergeOrder) ─────

/** One stage of the ENGRAVED boot merge order — the CLOSED set (the merge is pure). */
export type MergeLayer = "references" | "store" | "overrides";

/**
 * BOOT_MERGE_ORDER is the GRAVED boot merge order : references (.env.example, DP04) → store
 * (S91 Get, scopé project_id) → overrides (deploy-time, win last). Declared once as a
 * constant — NEVER derived from map iteration (determinism §6). A later layer overrides an
 * earlier one (last write wins). Byte-identical to the Go bootMergeOrder.
 */
export const BOOT_MERGE_ORDER: readonly MergeLayer[] = [
	"references",
	"store",
	"overrides",
] as const;

/** bootMergeOrder returns a fresh COPY of the engraved order (never the mutable array). */
export function bootMergeOrder(): MergeLayer[] {
	return [...BOOT_MERGE_ORDER];
}

// ── The typed refusal (mirrors blockreason MISSING_SECRET_AT_BOOT) ────────────────

/** A typed, actionable refusal — mirrors back/runtime/blockreason. */
export interface BootBlockReason {
	code: string;
	severity: string;
	explanation: string;
	howToFix: string[];
}

/** The fail-closed BlockReason code for a missing secret at boot (mirrors the Go code). */
export const MISSING_SECRET_AT_BOOT = "MISSING_SECRET_AT_BOOT";

/** missingAtBoot builds the actionable refusal, NAMING the unresolved keys. */
function missingAtBoot(detail: string): BootBlockReason {
	return {
		code: MISSING_SECRET_AT_BOOT,
		severity: "blocking",
		explanation:
			"Le boot de l'app émise est REFUSÉ (DP32/S91) : une référence de secret du " +
			".env.example reste NON RÉSOLUE (différence requises − (store ∪ overrides)). " +
			"L'injection des variables d'environnement au boot est FAIL-CLOSED — jamais " +
			"démarrée avec un credential vide ou deviné (honnêteté §8). " +
			detail,
		howToFix: [
			"set_the_missing_secret : déposez la référence manquante dans le store du projet (chiffré, scopé project_id).",
			"check_the_project_scope : vérifiez que le secret est posé sous le BON project_id (isolation cross-projet).",
			"add_a_deploy_override : à défaut d'un secret, fournissez la valeur en override d'environnement.",
			"rerun the boot : le blocage se lève dès que toutes les références requises sont résolues.",
		],
	};
}

// ── The reference model (the .env.example, references only) ──────────────────────

/** One parsed line of the emitted `.env.example` — a key and its reference value. */
export interface EnvRef {
	key: string;
	/** the emitted reference value — `<<from-secret-store>>` (secret), `<<deploy-time>>`, or a literal default. */
	value: string;
	/** whether this key is a SECRET reference (its value is the SECRET_PLACEHOLDER). */
	isSecret: boolean;
}

/**
 * parseEnvExample parses the emitted `.env.example` bytes into its declared key set, marking
 * each key's reference kind. PURE: it ignores blank/comment lines, splits on the FIRST `=`,
 * and never resolves a value (the references stay references). Mirrors the layer-1 parse of
 * the Go MergeBootEnv.
 */
export function parseEnvExample(envExample: string): EnvRef[] {
	const refs: EnvRef[] = [];
	for (const raw of envExample.split("\n")) {
		const t = raw.trim();
		if (t === "" || t.startsWith("#")) continue;
		const eq = t.indexOf("=");
		if (eq <= 0) continue;
		const key = t.slice(0, eq);
		const value = t.slice(eq + 1);
		refs.push({ key, value, isSecret: value === SECRET_PLACEHOLDER });
	}
	return refs;
}

/**
 * envExampleIsReferencesOnly is the DP04 done-criterion (property ∀): the emitted
 * `.env.example` carries ONLY references — never a concrete secret VALUE. It REUSES the S91
 * scanEmission (lib/secret-store) over the emitted bytes against the project's actual
 * values: a references-only file scans CLEAN (zero finding). True iff no secret value leaks
 * into the emitted source. "scan = code, jamais un LLM."
 */
export function envExampleIsReferencesOnly(
	envExample: string,
	knownValues: string[] = [],
): boolean {
	return isClean(envExample, knownValues);
}

/** scanEmittedSource runs the shared S91 scan over emitted bytes, returning the findings. */
export function scanEmittedSource(
	emittedSource: string,
	knownValues: string[] = [],
): Finding[] {
	return scanEmission(emittedSource, knownValues);
}

// ── The engraved boot merge (mirrors MergeBootEnv) ───────────────────────────────

/** The result of mergeBootEnv — the concrete env, or a fail-closed refusal. */
export interface MergeResult {
	ok: boolean;
	/** the CONCRETE boot env (every reference resolved) — empty on a block. */
	env: Record<string, string>;
	/** the SORTED keys of the env (deterministic render order for the panel). */
	keys: string[];
	/** the fail-closed refusal when a required secret is unresolved. */
	block?: BootBlockReason;
}

/**
 * mergeBootEnv resolves the CONCRETE boot environment for a project from the emitted
 * `.env.example` references, the project's S91 secret store, and the deploy-time overrides,
 * in the ENGRAVED order references → store → overrides (BOOT_MERGE_ORDER).
 *
 *   - Layer 1 (references). parseEnvExample yields the base key set. A deploy-time marker is
 *     carried forward (NOT a secret). A SECRET_PLACEHOLDER key is a secret REFERENCE.
 *   - Layer 2 (store). For each secret reference NOT covered by an override, it reads the
 *     live value from the project-scoped store (the twin's injectEnv path). A secret of
 *     project A is NEVER visible under project B (the (project, name) scope).
 *   - Layer 3 (overrides). A deploy-time override of ANY key wins last (sorted application).
 *
 * A secret reference left UNRESOLVED by both the store and an override (the set-difference
 * required-secret-refs − (store ∪ overrides)) is FAIL-CLOSED with MISSING_SECRET_AT_BOOT, the
 * missing keys NAMED. On a block it returns an EMPTY env (a blocked boot never half-resolves).
 *
 * It is a PURE, TOTAL function: same (envExample, store-state, projectId, overrides) →
 * byte-identical env. The emitted `.env.example` is NEVER mutated — resolution is in memory
 * only (the appliance boot material). Mirrors bootenv.go MergeBootEnv.
 */
export function mergeBootEnv(
	envExample: string,
	store: SecretStore,
	projectId: string,
	overrides: Record<string, string> = {},
): MergeResult {
	if (!projectId.trim()) {
		return {
			ok: false,
			env: {},
			keys: [],
			block: missingAtBoot(
				"Aucun project_id n'a été passé au merge du boot (le scope d'isolation est obligatoire).",
			),
		};
	}

	const merged: Record<string, string> = {};
	const secretRefs: string[] = [];

	// ── Layer 1: references (the .env.example base key set, DP04) ──────────────────
	for (const ref of parseEnvExample(envExample)) {
		merged[ref.key] = ref.value;
		if (ref.isSecret) secretRefs.push(ref.key);
	}
	secretRefs.sort();

	// ── Layer 2: store (S91 Get, scopé project_id) ────────────────────────────────
	const hasOverride = (k: string): boolean => Object.hasOwn(overrides, k);
	const missing: string[] = [];
	for (const ref of secretRefs) {
		if (hasOverride(ref)) continue; // an override resolves it at layer 3
		// the store-scoped value: injectEnv is the only value-egress surface (S91 twin);
		// a single-key injection under THIS project resolves the reference, leak-free.
		const inj = store.injectEnv(projectId, [ref]);
		if (!inj.ok || inj.env.length !== 1) {
			missing.push(ref); // absent under this project_id (or sealed for another — isolation)
			continue;
		}
		merged[ref] = inj.env[0].value;
	}
	if (missing.length > 0) {
		missing.sort();
		return {
			ok: false,
			env: {},
			keys: [],
			block: missingAtBoot(
				`Références de secret non résolues au boot pour le projet « ${projectId} » : ${missing.join(", ")}.`,
			),
		};
	}

	// ── Layer 3: overrides (deploy-time, win last) ────────────────────────────────
	const overrideKeys = Object.keys(overrides).sort(); // deterministic application order
	for (const k of overrideKeys) {
		merged[k] = overrides[k];
	}

	const keys = Object.keys(merged).sort();
	return { ok: true, env: merged, keys };
}

// ── The rotation decision (mirrors bootenv.go RotationDecision / RotateSecret) ────

/**
 * RotationDecision is the APPEND-ONLY record of a secret rotation : WHICH secret, under WHICH
 * project, and the content-address fingerprint BEFORE and AFTER — NEVER a value in the clear
 * (a decision that printed the secret would itself be a leak). A CHANGED fingerprint proves
 * the value moved WITHOUT exposing it. Mirrors the Go RotationDecision.
 */
export interface RotationDecision {
	projectId: string;
	name: string;
	oldFingerprint: string;
	newFingerprint: string;
}

/**
 * storeFingerprint derives a per-project content-address fingerprint over the project's LIVE
 * secret values — a stable digest that CHANGES when any value rotates, WITHOUT exposing the
 * values. It is the twin of secretstore.StoreFingerprint: a hash over (sorted key, sealed
 * value) pairs. Here the twin hashes (key, value) so a rotated value yields a new
 * fingerprint; the fingerprint is one-way (never reversible to a value).
 */
export function storeFingerprint(
	store: SecretStore,
	projectId: string,
): string {
	const names = store.keyNames(projectId);
	const parts: string[] = [];
	for (const name of names) {
		// injectEnv is the value-egress surface; a present key always resolves here.
		const inj = store.injectEnv(projectId, [name]);
		const sealed = inj.ok && inj.env.length === 1 ? inj.env[0].value : "";
		// hash the value alone so the per-name digest never echoes it; concat the digests.
		parts.push(`${name}:${createHash("sha256").update(sealed).digest("hex")}`);
	}
	return createHash("sha256")
		.update(`secretstore/fingerprint/v1:${projectId}\n${parts.join("\n")}`)
		.digest("hex");
}

/** A typed rotation outcome — the decision, or a typed refusal (rotating an absent secret). */
export type RotationResult =
	| { ok: true; decision: RotationDecision }
	| { ok: false; code: "not-found"; message: string };

/**
 * rotateSecret rotates a secret through the S91 door (store.rotate) and returns the
 * APPEND-ONLY RotationDecision. The rotation INVALIDATES the old value (the store supersedes
 * it — the next boot's mergeBootEnv injects the new one). The decision records the rotation
 * by content-address fingerprint (never the values). Rotating an ABSENT secret is refused
 * (you Set what does not exist, you Rotate what does — no silent create-on-rotate). Mirrors
 * the Go RotateSecret.
 */
export function rotateSecret(
	store: SecretStore,
	projectId: string,
	name: string,
	newValue: string,
): RotationResult {
	const before = storeFingerprint(store, projectId);
	if (!store.rotate(projectId, name, newValue)) {
		return {
			ok: false,
			code: "not-found",
			message: `rotation refusée — le secret « ${name} » n'existe pas pour le projet ${projectId} (on Set ce qui n'existe pas, on Rotate ce qui existe)`,
		};
	}
	const after = storeFingerprint(store, projectId);
	return {
		ok: true,
		decision: {
			projectId,
			name,
			oldFingerprint: before,
			newFingerprint: after,
		},
	};
}

// ── The demo fixtures the /app-ops « Secrets » panel drives ──────────────────────

/**
 * demoEnvExample is the canonical, REFERENCES-ONLY `.env.example` the panel drives — the
 * DP04 emission shape : non-secret defaults (the deploy-time marker, the domain) + secret
 * REFERENCES (`<<from-secret-store>>`). NO secret value in the clear (the property scans it
 * green by construction). Byte-shape aligned with the Go envemit emission.
 */
export function demoEnvExample(): string {
	return [
		"# .env.example — DP04 emission (references only, zero secret value)",
		`APP_NAME=${DEPLOY_TIME_PLACEHOLDER}`,
		"DOMAIN=sagedesk.fr",
		`APP_SECRET_DATABASE_URL=${SECRET_PLACEHOLDER}`,
		`APP_SECRET_OAUTH_CLIENT_SECRET=${SECRET_PLACEHOLDER}`,
		"",
	].join("\n");
}

/** A reference row the panel renders — the key + its emitted reference (never a value). */
export interface SecretReferenceRow {
	/** the secret key (the env-var the .env.example references). */
	name: string;
	/** the owning project (scope project_id — the isolation key). */
	projectId: string;
	/** the EMITTED reference (${VAR}-style) — NEVER a value. */
	reference: string;
	/** whether a live value is present in the project store (presence is leak-free). */
	present: boolean;
	/** the per-project store fingerprint AFTER the last set/rotate (proves change, not value). */
	fingerprint: string;
}

/**
 * referenceFor renders the EMITTED reference shape for a secret key (`${KEY}` — the
 * `.env.example` reference the panel shows). It is a pure string transform — NEVER a value.
 */
export function referenceFor(name: string): string {
	// the `.env.example` reference shape `${KEY}` — built from parts so the literal `$`/`{`
	// never reads as a template interpolation (it is the EMITTED reference text, not a value).
	const open = "$";
	return `${open}{${name}}`;
}
