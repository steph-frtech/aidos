"use server";

import {
	type BehaviorRecord,
	catalogue,
	type Kind,
	type Proposal,
	propose,
} from "@/lib/behavior-expander";

/**
 * Server Actions for the /behavior-expander Workbench panel (S76 — « AST behavior-macro + expander
 * dry-run déterministe, l'UNIQUE Expand »).
 *
 * THE STEP (ROADMAP-app-builder S76): a behavior RECORD (ownable, versioned, taggable, localizable)
 * whose Expand(behavior, entity) is the ONE pure authoritative function producing attributs /
 * relations / operations / policies / fixtures — never an LLM, never re-implemented (S67/S79/S80/S81
 * consume it). The EXPANSION is a PROPOSED DRAFT changeset, jamais une vérité appliquée.
 *
 * THE WALL (§2/§7). Every action WRITES NOTHING: it validates the record, runs the ONE Expand and
 * PROPOSES a DRAFT changeset — the `aidos` CLI applies it only after human approval; a reject
 * discards the DRAFT and the kernel is never touched. The expansion is PURE (lib/behavior-expander
 * over the ONE compound expander), never an LLM (determinism-first, §6/§8).
 */

export interface ProposeView {
	ok: boolean;
	proposal?: Proposal;
	record?: BehaviorRecord;
	error?: string;
}

/** behaviorList is the action behind the catalogue control — the reusable behaviours library. */
export async function behaviorList(): Promise<Kind[]> {
	return catalogue();
}

/**
 * proposeAction is the action-capable control behind the expander (CLAUDE.md §7 ui-completeness): the
 * user picks a behavior + entity, owns/versions/tags/localises the record, and submits — the action
 * VALIDATES the record and, on success, runs the ONE Expand and PRODUCES a `proposed` (DRAFT)
 * ChangeSet carrying the canonical expansion. An unknown behavior or a malformed record yields a
 * verbatim S76 error (never a guessed expansion). It WRITES NOTHING (the wall).
 */
export async function proposeAction(
	_prev: ProposeView,
	formData: FormData,
): Promise<ProposeView> {
	const kind = String(formData.get("behavior") ?? "ownable").trim() as Kind;
	const entity = String(formData.get("entity") ?? "Order").trim();
	const owner = String(formData.get("owner") ?? "alice").trim();
	const version = Number(formData.get("version") ?? 1);
	const tags = String(formData.get("tags") ?? "scoping")
		.split(",")
		.map((s) => s.trim())
		.filter(Boolean);
	const fr = String(formData.get("labelFr") ?? "propriété").trim();
	const en = String(formData.get("labelEn") ?? "").trim();
	const parentPhase = String(formData.get("parentPhase") ?? "phase-0").trim();

	const labels: Record<string, string> = { fr };
	if (en) labels.en = en;
	const record: BehaviorRecord = { kind, owner, version, tags, labels };

	const proposal = propose(record, entity, parentPhase);
	if (!proposal.ok) return { ok: true, record, error: proposal.error };
	return { ok: true, record, proposal };
}
