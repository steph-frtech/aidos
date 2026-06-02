/**
 * The truth-typing projection — the Workbench /truth-typing source (AIDOS step S14).
 *
 * KRD §13.4–13.5 (épistémologie opérationnelle): every Truth carries a TruthKind (its
 * EPISTEMIC type — behavioral/structural/… — NOT a mirror's test_kind) and a
 * VerifiabilityLevel (CAN the ratchet bite this signal at all?). The rule: "Si le
 * signal n'est pas vérifiable, KRD ne certifie pas. Il passe en /spike, en
 * expérimentation ou en revue humaine." A truth with no TruthKind is REJECTED; a
 * non-verifiable truth is ROUTED to /spike (the ratchet stays OFF — NOT a failure).
 *
 * This module is the DECLARED projection of the Go package back/kernel/truthtyping —
 * the same seven kinds, five levels, allowed_mode table and classify verdict — so the
 * /truth-typing panel routes exactly as the Go classifier routes. One source, no drift.
 *
 * DETERMINISM-FIRST (CLAUDE.md §6/§8): pure functions over their input — no clock, no
 * rng, no I/O — so the same Truth always yields the same Routing. The reproducibility
 * mirror lib/truth-typing.test.ts pins the admission-gate invariant (only a
 * deterministic level is admitted), determinism, and the exact enum cardinalities.
 *
 * READ-ONLY (CLAUDE.md §7 ui-completeness): /truth-typing renders the classifier's
 * verdict over candidate truths; it never writes truth (the wall). Truth-writes go via
 * propose → ChangeSet → approval, never from this screen.
 */

/** The seven KRD §13.4 TruthKinds, in canonical order. */
export const TRUTH_KINDS = [
	"behavioral",
	"structural",
	"experiential",
	"economic",
	"regulatory",
	"statistical",
	"exploratory",
] as const;
export type TruthKind = (typeof TRUTH_KINDS)[number];

/** The five KRD §13.5 VerifiabilityLevels, in canonical order. */
export const VERIFIABILITY_LEVELS = [
	"deterministic",
	"statistical",
	"delayed",
	"human_judged",
	"unverifiable",
] as const;
export type VerifiabilityLevel = (typeof VERIFIABILITY_LEVELS)[number];

/** The four KRD §13.5 allowed_mode admission gates. */
export type AllowedMode = "kernel" | "experiment" | "spike" | "manual_review";

/**
 * ALLOWED_MODE — the DECLARED human rule of KRD §13.5 (never learned), mirroring
 * back/kernel/truthtyping allowedMode. Only `deterministic` may enter the kernel.
 */
export const ALLOWED_MODE: Readonly<Record<VerifiabilityLevel, AllowedMode>> = {
	deterministic: "kernel",
	statistical: "experiment",
	delayed: "spike",
	human_judged: "manual_review",
	unverifiable: "spike",
} as const;

/** The routing zones (mirrors truthtyping.Zone). */
export type Zone =
	| "kernel"
	| "/spike"
	| "experiment"
	| "manual_review"
	| "rejected";

/** The S14-local rejection codes (mirrors truthtyping.BlockCode). */
export type BlockCode =
	| "missing-truth-kind"
	| "unknown-truth-kind"
	| "unknown-verifiability-level";

/** A candidate truth's two epistemic-typing fields (an empty string == not set). */
export interface Truth {
	truthKind: string;
	verifiabilityLevel: string;
}

/** The classifier's verdict (mirrors truthtyping.Routing). */
export interface Routing {
	zone: Zone;
	allowedMode?: AllowedMode;
	admitted: boolean;
	code?: BlockCode;
}

function isKnownKind(k: string): k is TruthKind {
	return (TRUTH_KINDS as readonly string[]).includes(k);
}

function isKnownLevel(l: string): l is VerifiabilityLevel {
	return (VERIFIABILITY_LEVELS as readonly string[]).includes(l);
}

/**
 * classify — the pure verdict of KRD §13.4–13.5 over a Truth, mirroring
 * truthtyping.Classify. Rejects an absent/unknown truth_kind; routes by the level's
 * allowed_mode (kernel ⇒ admitted; anything else ⇒ routed away, ratchet OFF).
 */
export function classify(t: Truth): Routing {
	if (t.truthKind === "") {
		return { zone: "rejected", admitted: false, code: "missing-truth-kind" };
	}
	if (!isKnownKind(t.truthKind)) {
		return { zone: "rejected", admitted: false, code: "unknown-truth-kind" };
	}
	if (!isKnownLevel(t.verifiabilityLevel)) {
		return {
			zone: "rejected",
			admitted: false,
			code: "unknown-verifiability-level",
		};
	}
	const mode = ALLOWED_MODE[t.verifiabilityLevel];
	const zone: Zone =
		mode === "kernel"
			? "kernel"
			: mode === "experiment"
				? "experiment"
				: mode === "manual_review"
					? "manual_review"
					: "/spike";
	return { zone, allowedMode: mode, admitted: mode === "kernel" };
}

/** The routing badge variant a Routing maps to (for the table). */
export type BadgeVariant = "kernel" | "spike" | "rejected";

/** badgeVariant — green KERNEL (admitted), amber /SPIKE (routed away), red REJECTED. */
export function badgeVariant(r: Routing): BadgeVariant {
	if (r.zone === "rejected") return "rejected";
	if (r.admitted) return "kernel";
	return "spike";
}
