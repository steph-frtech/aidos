"use server";

import {
	type BlockReason,
	type Draft,
	type EntityNode,
	type MergeOutcome,
	mergeDrafts,
	type Proposal,
	propose,
	schemaHash,
	validate,
} from "@/lib/entity-modeler";

/**
 * Server Actions for the /entity-modeler Workbench panel (S75 — « modeleur entité/relation »).
 *
 * THE STEP (ROADMAP-app-builder S75): shape a draft entity/relation schema on a canvas and
 * PROPOSE it as a project-scoped Kernel source via propose → ChangeSet → approval — NEVER a
 * direct truth-write from the screen (the wall, CLAUDE.md §2). Draft-level concurrency
 * (presence/lock/CRDT) is handled so two editors do not overwrite each other.
 *
 * THE WALL (§2/§7). Every action WRITES NOTHING: it validates, hashes and PROPOSES a draft.
 * proposeAction returns a `proposed` (DRAFT) ChangeSet — the `aidos` CLI applies it only
 * after human approval. A reject discards the DRAFT; the kernel is never touched. The
 * schema hash and the merge are PURE (lib/entity-modeler), never an LLM.
 */

export interface ProposeView {
	ok: boolean;
	/** the draft as modeled (echoed back for display). */
	draft: Draft | null;
	/** the proposed (DRAFT) changeset when the draft is proposable. */
	proposal?: Proposal;
	/** the input-order-invariant schema hash. */
	schemaHash?: string;
	/** the refusal when the draft is not a proposable schema. */
	block?: BlockReason;
}

/**
 * proposeAction is the action-capable control behind the canvas (CLAUDE.md §7
 * ui-completeness): the user models Customer↔Order (the demo draft is pre-filled and may
 * be tweaked via the relation target) and submits — the action VALIDATES the draft and, on
 * success, PRODUCES a `proposed` (DRAFT) ChangeSet carrying the canonical draft as a
 * project-scoped source. An undeclared relation target yields the MODELER_INVALID_DRAFT
 * BlockReason (never a guessed mapping). It WRITES NOTHING (the wall).
 */
export async function proposeAction(
	_prev: ProposeView,
	formData: FormData,
): Promise<ProposeView> {
	const project = String(formData.get("project") ?? "shop").trim();
	const relTarget = String(formData.get("relTarget") ?? "Customer").trim();
	const parentPhase = String(formData.get("parentPhase") ?? "phase-0").trim();

	const idAttr = {
		name: "id",
		type: "string" as const,
		required: true,
		identifier: true,
	};
	const nodes: EntityNode[] = [
		{
			entity: {
				name: "Customer",
				attributes: [idAttr, { name: "email", type: "string", required: true }],
			},
			relations: [],
		},
		{
			entity: {
				name: "Order",
				attributes: [
					idAttr,
					{ name: "total", type: "decimal", required: true },
				],
			},
			relations: [
				{
					name: "customer",
					target: relTarget,
					cardinality: "1-N",
					semantic: "fk",
					required: true,
				},
			],
		},
	];
	const draft: Draft = { project, nodes };

	const cause = validate(draft);
	if (cause) {
		const p = propose(draft, parentPhase);
		return { ok: true, draft, block: p.block };
	}
	const proposal = propose(draft, parentPhase);
	return { ok: true, draft, proposal, schemaHash: schemaHash(draft) };
}

export interface MergeView {
	ok: boolean;
	outcome?: MergeOutcome;
}

/**
 * mergeAction is the action-capable control proving "deux éditeurs simultanés ne s'écrasent
 * pas" (CLAUDE.md §7): two editors fork the same canvas, each adds a node concurrently, and
 * the merge keeps BOTH (no silent overwrite). It WRITES NOTHING (pure CRDT merge).
 */
export async function mergeAction(
	_prev: MergeView,
	_formData: FormData,
): Promise<MergeView> {
	const idAttr = {
		name: "id",
		type: "string" as const,
		required: true,
		identifier: true,
	};
	const customer: EntityNode = {
		entity: {
			name: "Customer",
			attributes: [idAttr, { name: "email", type: "string", required: true }],
		},
		relations: [],
	};
	const order: EntityNode = {
		entity: {
			name: "Order",
			attributes: [idAttr, { name: "total", type: "decimal", required: true }],
		},
		relations: [
			{
				name: "customer",
				target: "Customer",
				cardinality: "1-N",
				semantic: "fk",
				required: true,
			},
		],
	};
	const invoice: EntityNode = {
		entity: {
			name: "Invoice",
			attributes: [idAttr, { name: "amount", type: "decimal", required: true }],
		},
		relations: [
			{
				name: "customer",
				target: "Customer",
				cardinality: "1-N",
				semantic: "fk",
			},
		],
	};
	const base: Draft = { project: "shop", nodes: [customer] };
	// editor Alice adds Order; editor Bob adds Invoice (concurrently, off the same base).
	const alice: Draft = { project: "shop", nodes: [customer, order] };
	const bob: Draft = { project: "shop", nodes: [customer, invoice] };

	return { ok: true, outcome: mergeDrafts(base, alice, bob) };
}
