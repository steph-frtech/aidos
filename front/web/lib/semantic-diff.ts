/**
 * Pure TS mirror of the Go SemanticDiff classifier (back/runtime/semanticdiff) — AIDOS step S21.
 *
 * SemanticDiff reads the NATURE of a kernel change between two versions (old@hash → new@hash) — KRD
 * §44.1 — instead of a textual line diff, and names it with one member of the CLOSED set this step
 * lands: {add, refine, override, rescope, reweight, deprecate}; or the explicit `unclassifiable`
 * verdict (an OpenQuestion, never a fabricated type); or `none` (identity).
 *
 * DETERMINISM-FIRST (CLAUDE.md §6): classify is a PURE function — same (old,new) ⇒ same change_type,
 * no I/O, no clock, no rng, NO WRITE. The /semantic-diff panel RENDERS this result (the same Classify
 * the Go `aidos diff` emits), it does not re-implement the rule. READ-ONLY: the panel never writes
 * truth (the wall — applying a change is the ChangeSet path, never the screen).
 *
 * The classification precedence MUST match the Go Classify (semanticdiff.go):
 *  1 identity → none · 2 old absent → add · 3 lifecycle → deprecate · 4 scope-only → rescope ·
 *  5 weight-only → reweight · 6 enabled_when change → override · 7 consistent narrow → refine ·
 *  8 otherwise → unclassifiable.
 */

export type ChangeType =
	| "add"
	| "refine"
	| "override"
	| "rescope"
	| "reweight"
	| "deprecate"
	| "unclassifiable"
	| "none";

/** The SIX §44.1 change_types S21 lands, in canonical order (the Workbench legend reads this). */
export const LANDED_TYPES: readonly ChangeType[] = [
	"add",
	"refine",
	"override",
	"rescope",
	"reweight",
	"deprecate",
];

export type Body = Record<string, unknown>;

/** An Artifact is one kernel version: its canonical body + its version@hash. null body = absent. */
export interface Artifact {
	readonly version: string;
	readonly body: Body | null;
}

export interface SemanticDiff {
	readonly changeType: ChangeType;
	readonly blastRadius: string;
	readonly requiresAuthority: string;
	readonly redWave: string;
	readonly oldVersion: string;
	readonly newVersion: string;
	readonly openQuestion: string;
}

const DEAD_STATUSES = new Set(["deprecated", "shadowed", "removed"]);

/** Stable JSON for value equality (object keys sorted recursively) — mirrors S02 canonicalization. */
function canon(v: unknown): string {
	if (v === null || typeof v !== "object") return JSON.stringify(v) ?? "null";
	if (Array.isArray(v)) return `[${v.map(canon).join(",")}]`;
	const obj = v as Record<string, unknown>;
	const keys = Object.keys(obj).sort();
	return `{${keys.map((k) => `${JSON.stringify(k)}:${canon(obj[k])}`).join(",")}}`;
}

function canonEqual(a: unknown, b: unknown): boolean {
	return canon(a) === canon(b);
}

function withoutKeys(m: Body, ...keys: string[]): Body {
	const out: Body = { ...m };
	for (const k of keys) delete out[k];
	return out;
}

function bodyEqualExcept(old: Body, next: Body, ...keys: string[]): boolean {
	return canonEqual(withoutKeys(old, ...keys), withoutKeys(next, ...keys));
}

function statusOf(m: Body): string {
	if (typeof m.lifecycle === "string") return m.lifecycle;
	if (typeof m.status === "string") return m.status;
	return "";
}

function isDeprecation(old: Body, next: Body): boolean {
	const ns = statusOf(next);
	if (!DEAD_STATUSES.has(ns)) return false;
	if (DEAD_STATUSES.has(statusOf(old))) return false;
	return bodyEqualExcept(old, next, "status", "lifecycle");
}

function isScopeOnlyChange(old: Body, next: Body): boolean {
	if (canonEqual(old.scope, next.scope)) return false;
	if (!("scope" in old) && !("scope" in next)) return false;
	return bodyEqualExcept(old, next, "scope");
}

function isWeightOnlyChange(old: Body, next: Body): boolean {
	if (!("weight" in old) || !("weight" in next)) return false;
	if (canonEqual(old.weight, next.weight)) return false;
	return bodyEqualExcept(old, next, "weight");
}

function isEnabledWhenOverride(old: Body, next: Body): boolean {
	if (!("enabled_when" in old) || !("enabled_when" in next)) return false;
	if (canonEqual(old.enabled_when, next.enabled_when)) return false;
	return bodyEqualExcept(old, next, "enabled_when");
}

function isRefinement(old: Body, next: Body): boolean {
	let addedKey = false;
	for (const k of Object.keys(next)) if (!(k in old)) addedKey = true;
	if (!addedKey) return false;
	for (const k of Object.keys(old)) {
		if (!(k in next) || !canonEqual(old[k], next[k])) return false;
	}
	return true;
}

/**
 * classify reads the nature of the change from old to next and returns the SemanticDiff. Pure,
 * total, deterministic; never throws. blast_radius/requires_authority/red_wave are left empty here
 * (referenced, not recomputed); the data layer fills them for the canonical examples.
 */
export function classify(old: Artifact, next: Artifact): SemanticDiff {
	const base = {
		blastRadius: "",
		requiresAuthority: "",
		redWave: "",
		oldVersion: old.version,
		newVersion: next.version,
		openQuestion: "",
	};

	const oldAbsent = old.body === null;
	const nextAbsent = next.body === null;

	if (!oldAbsent && !nextAbsent && canonEqual(old.body, next.body)) {
		return { ...base, changeType: "none" };
	}
	if (oldAbsent) {
		if (nextAbsent) {
			return {
				...base,
				changeType: "unclassifiable",
				openQuestion:
					"both old and new are absent — there is no artifact to classify",
			};
		}
		return { ...base, changeType: "add" };
	}
	if (nextAbsent) {
		return {
			...base,
			changeType: "unclassifiable",
			openQuestion:
				"new is absent — a truth dies by versioned succession (deprecate), never deletion (KRD §44.2)",
		};
	}

	const o = old.body as Body;
	const n = next.body as Body;

	if (isDeprecation(o, n)) return { ...base, changeType: "deprecate" };
	if (isScopeOnlyChange(o, n)) return { ...base, changeType: "rescope" };
	if (isWeightOnlyChange(o, n)) return { ...base, changeType: "reweight" };
	if (isEnabledWhenOverride(o, n)) return { ...base, changeType: "override" };
	if (isRefinement(o, n)) return { ...base, changeType: "refine" };

	return {
		...base,
		changeType: "unclassifiable",
		openQuestion:
			"the change does not map to any of the six §44.1 change_types this step lands; route it to a human (provenance), not a guess",
	};
}
