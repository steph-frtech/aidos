/**
 * Pure mirror of the Go ChangeSet state machine (back/archive/changeset) — AIDOS step S20.
 *
 * A ChangeSet is the atomic, reversible transactional ENVELOPE that moves the kernel from one
 * stable phase to the next, wrapping `spec_delta` (Kernel) and `mirror_delta` (Mirror) TOGETHER in
 * one body so they can never drift. Its only statuses are DRAFT | APPLIED | REVERTED — there is NO
 * FAILED. An APPLIED envelope is IMMUTABLE; a revert is a NEW INVERSE ChangeSet appended to the log.
 *
 * DETERMINISM-FIRST (CLAUDE.md §6): these are pure functions — same input ⇒ same verdict, no I/O, no
 * clock, no rng. The /changeset panel renders the lifecycle by running them per row, computing the
 * exact verdicts the Go Apply/Edit/Revert compute. READ-ONLY: the panel never writes truth (the
 * wall — a real apply goes through the changeset MCP / the commit-gate, never the screen).
 */

export type Status = "DRAFT" | "APPLIED" | "REVERTED";

export const STATUSES: readonly Status[] = ["DRAFT", "APPLIED", "REVERTED"];

export interface Delta {
	readonly kind: "add" | "remove" | "refine";
	readonly target: string;
}

export interface ChangeSet {
	readonly id: string;
	readonly label: string;
	readonly status: Status;
	readonly parentPhase: string;
	readonly specDelta: Delta | null;
	readonly mirrorDelta: Delta | null;
	readonly reverts: string | null;
	readonly appliedAt: string | null;
}

export type BlockCode =
	| "INCOMPLETE_CHANGESET"
	| "APPLIED_IS_IMMUTABLE"
	| "NOT_DRAFT"
	| "NOT_APPLIED";

export interface BlockReason {
	readonly code: BlockCode;
	readonly severity: "error";
	readonly explanation: string;
	readonly howToFix: readonly string[];
}

/** invert negates a delta (add ⇄ remove; refine is its own inverse), preserving the target. */
function invert(d: Delta): Delta {
	const kind =
		d.kind === "add" ? "remove" : d.kind === "remove" ? "add" : "refine";
	return { kind, target: d.target };
}

/**
 * specHasMirror is the MINIMAL completeness predicate (mirror of Go SpecHasMirror): a spec_delta
 * REQUIRES a mirror_delta in the same envelope. A spec without its mirror is a monster — blocked
 * with INCOMPLETE_CHANGESET + how_to_fix add_mirror_for_spec_delta.
 */
export function specHasMirror(cs: ChangeSet): BlockReason | null {
	if (cs.specDelta !== null && cs.mirrorDelta === null) {
		return {
			code: "INCOMPLETE_CHANGESET",
			severity: "error",
			explanation:
				"le ChangeSet porte un spec_delta sans son mirror_delta — un spec sans son miroir est un monstre (loi de complétude) ; le passage à APPLIED est refusé.",
			howToFix: ["add_mirror_for_spec_delta"],
		};
	}
	return null;
}

/** apply commits a DRAFT to APPLIED iff complete; otherwise returns the BlockReason. Pure. */
export function apply(
	cs: ChangeSet,
	appliedAt: string,
): { applied: ChangeSet; block: BlockReason | null } {
	if (cs.status !== "DRAFT") {
		return {
			applied: cs,
			block: {
				code: "NOT_DRAFT",
				severity: "error",
				explanation: `seul un ChangeSet DRAFT peut être appliqué ; celui-ci est ${cs.status}.`,
				howToFix: ["open_a_new_draft", "revert_if_applied"],
			},
		};
	}
	const block = specHasMirror(cs);
	if (block) return { applied: cs, block };
	return { applied: { ...cs, status: "APPLIED", appliedAt }, block: null };
}

/** edit refuses any in-place change to an APPLIED/REVERTED envelope (immutable). Pure. */
export function edit(cs: ChangeSet): BlockReason | null {
	if (cs.status === "APPLIED" || cs.status === "REVERTED") {
		return {
			code: "APPLIED_IS_IMMUTABLE",
			severity: "error",
			explanation: `un ChangeSet ${cs.status} est IMMUABLE — il ne peut être édité en place ; la seule écriture légale sur sa lignée est l'ajout d'un ChangeSet inverse (revert).`,
			howToFix: [
				"open_a_revert_changeset",
				"open_a_new_draft_for_a_further_change",
			],
		};
	}
	return null;
}

/**
 * revert builds the INVERSE of an APPLIED envelope as a NEW DRAFT (negated deltas, reverts=source)
 * WITHOUT mutating the source. Returns the inverse, or a BlockReason if the source is not APPLIED.
 * The inverse id is supplied by the caller (the real content hash is computed server-side); here it
 * is derived deterministically for display. Pure.
 */
export function revert(
	source: ChangeSet,
	inverseId: string,
): { inverse: ChangeSet | null; block: BlockReason | null } {
	if (source.status !== "APPLIED") {
		return {
			inverse: null,
			block: {
				code: "NOT_APPLIED",
				severity: "error",
				explanation: `seul un ChangeSet APPLIED peut être reverté ; celui-ci est ${source.status}.`,
				howToFix: ["apply_before_reverting"],
			},
		};
	}
	const inverse: ChangeSet = {
		id: inverseId,
		label: `revert: ${source.label}`,
		status: "DRAFT",
		parentPhase: source.parentPhase,
		specDelta: source.specDelta ? invert(source.specDelta) : null,
		mirrorDelta: source.mirrorDelta ? invert(source.mirrorDelta) : null,
		reverts: source.id,
		appliedAt: null,
	};
	return { inverse, block: null };
}

/** stampReverted returns the source stamped REVERTED (the lifecycle stamp when its inverse applies). Pure. */
export function stampReverted(source: ChangeSet): ChangeSet {
	return { ...source, status: "REVERTED" };
}
