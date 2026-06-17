"use server";

import {
	type BlockReason,
	type Draft,
	type EntityNode,
	type MergeOutcome,
	type Proposal,
	propose,
} from "@/lib/entity-modeler";
import {
	demoHash,
	demoMerge,
	demoValidate,
	draftArg,
	MERGE_ALICE,
	MERGE_BASE,
	MERGE_BOB,
	mergeArgs,
	type ValidateView,
} from "@/lib/entity-modeler-data";
import { readVia, type Source } from "@/lib/gateway-sdk";
import { panelScope } from "@/lib/panelScope";
import { hashDecoder, mergeDecoder, validateDecoder } from "./live";

/**
 * Server Actions for the /entity-modeler Workbench panel (S75 — « modeleur entité/relation »).
 *
 * THE STEP (ROADMAP-app-builder S75): shape a draft entity/relation schema on a canvas and PROPOSE it as
 * a project-scoped Kernel source via propose → ChangeSet → approval — NEVER a direct truth-write from the
 * screen (the wall, CLAUDE.md §2). Draft-level concurrency (presence/lock/CRDT) is handled so two editors
 * do not overwrite each other.
 *
 * THE FLIP (ADR 0092 batch-4B — the Go engine is the SINGLE live source). The READ controls — validate,
 * hash, and the CRDT merge — now read LIVE from the Go entity-modeler MCP server through the passerelle
 * (`readVia(scope, "schema_validate" | "schema_hash" | "canvas_merge", …)`, the dispatched below-the-line
 * reads), with the twin compute preserved ONLY as the deterministic demo fallback (lib/entity-modeler-data,
 * tagged `source:"live"|"demo"`). The `readVia` frontier import keeps the T5 cliquet GREEN (the twin sits
 * behind the demo fallback, never as the live source — and the `-data.ts` sibling now makes the cliquet
 * recognise `lib/entity-modeler` as a twin at all).
 *
 * THE WALL (§2/§7). Every action WRITES NOTHING. proposeAction returns a `proposed` (DRAFT) ChangeSet —
 * the `aidos` CLI applies it only after human approval. schema_propose is NOT dispatched (it carries a
 * RawMessage ChangeSet body + is a truth-proposal), so the panel keeps its propose→ChangeSet voie propre
 * via the twin `propose` (the demo compute of the same DRAFT envelope).
 */

export interface ProposeView {
	ok: boolean;
	/** the draft as modeled (echoed back for display). */
	draft: Draft | null;
	/** the proposed (DRAFT) changeset when the draft is proposable. */
	proposal?: Proposal;
	/** the input-order-invariant schema hash (read LIVE from the Go engine, twin fallback). */
	schemaHash?: string;
	/** the refusal when the draft is not a proposable schema. */
	block?: BlockReason;
	/** the read source — "live" (the Go engine answered) or "demo" (the deterministic fallback). */
	source?: Source;
}

/**
 * proposeAction is the action-capable control behind the canvas (CLAUDE.md §7 ui-completeness): the user
 * models Customer↔Order (the demo draft is pre-filled and may be tweaked via the relation target) and
 * submits — the action VALIDATES the draft LIVE (the Go engine, demo fallback) and, on success, reads the
 * LIVE schema hash and PRODUCES a `proposed` (DRAFT) ChangeSet carrying the canonical draft. An undeclared
 * relation target yields the MODELER_INVALID_DRAFT BlockReason (never a guessed mapping). It WRITES
 * NOTHING (the wall).
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

	const scope = await panelScope();
	// LIVE validate (the Go modeler resolves every relation; twin demoValidate is the fallback).
	const { data: verdict, source } = await readVia<ValidateView>(
		scope,
		"schema_validate",
		draftArg(draft),
		validateDecoder,
		demoValidate(draft),
	);
	if (!verdict.ok) {
		// A reject: surface the LIVE block (or the twin's), the kernel is never touched.
		return { ok: true, draft, block: verdict.block, source };
	}
	// LIVE schema hash (the Go modeler.SchemaHash; twin demoHash is the fallback).
	const { data: hash } = await readVia<string>(
		scope,
		"schema_hash",
		draftArg(draft),
		hashDecoder,
		demoHash(draft),
	);
	// The DRAFT ChangeSet stays the propose→ChangeSet door (schema_propose is not dispatched): the twin
	// `propose` builds the same DRAFT envelope the panel shows; the aidos CLI applies it under approval.
	const proposal = propose(draft, parentPhase);
	return { ok: true, draft, proposal, schemaHash: hash, source };
}

export interface MergeView {
	ok: boolean;
	outcome?: MergeOutcome;
	/** the read source — "live" (the Go engine answered) or "demo" (the deterministic fallback). */
	source?: Source;
}

/**
 * mergeAction is the action-capable control proving "deux éditeurs simultanés ne s'écrasent pas"
 * (CLAUDE.md §7): two editors fork the same canvas, each adds a node concurrently, and the merge keeps
 * BOTH (no silent overwrite). It reads the CRDT outcome LIVE from the Go engine (twin demoMerge is the
 * fallback). It WRITES NOTHING.
 */
export async function mergeAction(
	_prev: MergeView,
	_formData: FormData,
): Promise<MergeView> {
	const scope = await panelScope();
	const { data: outcome, source } = await readVia<MergeOutcome>(
		scope,
		"canvas_merge",
		mergeArgs(MERGE_BASE, MERGE_ALICE, MERGE_BOB),
		mergeDecoder,
		demoMerge(MERGE_BASE, MERGE_ALICE, MERGE_BOB),
	);
	return { ok: true, outcome, source };
}
