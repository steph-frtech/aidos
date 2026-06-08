/**
 * Attach-a-behavior-at-capture — the DECLARED TWIN of the Go package back/runtime/behaviorcapture
 * (S67, KRD §24.6). At idea-capture the reusable behaviours library is surfaced; attaching one
 * DRY-RUN-EXPANDS it as a DRAFT ChangeSet PROPOSAL.
 *
 * THE SINGLE EXPANDER (the load-bearing law of S67). The expansion is produced by the ONE
 * authoritative `expand` of lib/behavior (the TS twin of S76's behavior.Expand) — NEVER a second
 * implementation. This module CONSUMES it; it does not re-derive the catalogue, the idempotence
 * rule, or the content address. The attached expansion is therefore BYTE-IDENTICAL to S76's (the
 * expansionId matches the Go golden — pinned by lib/behavior.test.ts).
 *
 * THE WALL (CLAUDE.md §2/§7). This module writes NOTHING. attachBehaviorAtCapture returns a
 * Proposal VALUE — a DRAFT ChangeSet wrapping the dry-run expansion (wroteKernel stays false). The
 * screen PROPOSES it; freezing the expanded source into the kernel goes through the wall
 * (idée → miroir → /goal → approbation humaine), via the changeset door (S20) under approval. The
 * authoritative content-addressed ChangeSet id is the Go one, computed server-side at persistence;
 * the front carries a stable proposal handle (the byte-identical expansionId) for the preview.
 *
 * DETERMINISM-FIRST (CLAUDE.md §6/§8). attachBehaviorAtCapture is PURE + TOTAL. Same (ideaRef,
 * attachment) ⇒ byte-identical Proposal. The reproducibility mirror lib/behavior-capture.test.ts
 * pins it; the expansion id is the Go content address.
 */

import {
	type Attachment,
	type Expansion,
	expand,
	type Kind,
	pieceCount,
	sortedNames,
} from "./behavior";

export type { Attachment, Expansion, Kind } from "./behavior";
export { catalogue as library } from "./behavior";

/** ERR_NO_IDEA — twin of behaviorcapture.ErrNoIdea. */
export const ERR_NO_IDEA = "behaviorcapture: attach has no captured-idea ref";

/** A proposed DRAFT ChangeSet wrapping the dry-run expansion (twin of changeset.ChangeSet/Delta). */
export interface ProposedChangeSet {
	/** The stable proposal handle (the byte-identical expansionId; the authoritative id is Go's). */
	ref: string;
	/** Always "DRAFT" — a proposal, never applied (the wall). */
	status: "DRAFT";
	/** The spec_delta target (the entity the expansion would land on). */
	specDeltaTarget: string;
	/** The human-readable label. */
	label: string;
}

/** Proposal is what attachBehaviorAtCapture returns (twin of behaviorcapture.Proposal). */
export interface Proposal {
	ideaRef: string;
	expansion: Expansion;
	changeSet: ProposedChangeSet;
}

export interface AttachResult {
	/** The proposal, or null when the attach was refused. */
	result: Proposal | null;
	/** The actionable refusal message (verbatim), or null. */
	error: string | null;
}

/**
 * attachBehaviorAtCapture is the S67 attach — PURE, TOTAL, DRY-RUN. It expands the attached
 * behavior via the ONE authoritative `expand` (lib/behavior), wraps it as a DRAFT ChangeSet
 * PROPOSAL targeted at the entity, and WRITES NOTHING. An empty idea ref / unknown behavior /
 * entity-less attachment returns a refusal (never a guessed expansion).
 */
export function attachBehaviorAtCapture(
	ideaRef: string,
	a: Attachment,
): AttachResult {
	if (!ideaRef.trim()) return { result: null, error: ERR_NO_IDEA };
	let expansion: Expansion;
	try {
		// THE SINGLE EXPANDER — no second implementation.
		expansion = expand(a);
	} catch (e) {
		return { result: null, error: e instanceof Error ? e.message : String(e) };
	}
	const changeSet: ProposedChangeSet = {
		ref: expansion.expansionId,
		status: "DRAFT",
		specDeltaTarget: expansion.entity,
		label: `attach behavior "${expansion.behavior}" to "${expansion.entity}" (capture ${ideaRef})`,
	};
	return { result: { ideaRef, expansion, changeSet }, error: null };
}

/** proposalPieceCount totals the proposed pieces (defers to lib/behavior — one source). PURE. */
export function proposalPieceCount(p: Proposal): number {
	return pieceCount(p.expansion);
}

/** proposalPreview returns the sorted proposed piece names (defers to lib/behavior). PURE. */
export function proposalPreview(p: Proposal): string[] {
	return sortedNames(p.expansion);
}
