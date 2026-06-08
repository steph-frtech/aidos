"use server";

import { activeProjectContext } from "@/lib/activeProjectServer";
import {
	deriveShape,
	mergeEdits,
	openDraft,
	type ParsedSpec,
	proposeMirror,
	type TruthNature,
} from "@/lib/shape-editor";

/**
 * Server Actions for the /shape-editor Workbench panel (S68 — the three-shape mirror editor).
 *
 * THE STEP (ROADMAP-app-builder S68, KRD §34/§90): a human authors a mirror by its FORM, the form is
 * DERIVED from the truth-NATURE (never chosen), the source is PARSED by a pure parser, and the red,
 * project-scoped mirror is proposed as a DRAFT ChangeSet. Two concurrent draft edits MERGE or LOCK —
 * never last-write-wins. Shape selection + parsing are PURE FUNCTIONS, never an LLM.
 *
 * THE WALL (CLAUDE.md §2/§7). Every action WRITES NOTHING — it returns the derivation, the proposal
 * (a DRAFT ChangeSet), or the merge verdict as VALUES. Freezing the authored mirror into the mirrors
 * schema goes through the wall (propose → ChangeSet → approval), via the changeset door (S20); the
 * agent DB role can never write the mirrors/kernel. The screen PROPOSES, it never writes truth.
 */

export interface DeriveResultView {
	ok: boolean;
	messageKey: string;
	nature?: string;
	shape?: string;
	testKind?: string;
	certLanguage?: string;
}

/** deriveShapeAction is the read control — derive the mirror form from a picked truth-nature. */
export async function deriveShapeAction(
	_prev: DeriveResultView,
	formData: FormData,
): Promise<DeriveResultView> {
	const nature = String(formData.get("nature") ?? "").trim();
	const der = deriveShape(nature);
	if (der === null) {
		return { ok: false, messageKey: "natureUnknown", nature };
	}
	return {
		ok: true,
		messageKey: "deriveOk",
		nature,
		shape: der.shape,
		testKind: der.testKind,
		certLanguage: der.certLanguage,
	};
}

export interface ProposeResultView {
	ok: boolean;
	/** i18n key under "shapeEditor.messages". */
	messageKey: string;
	error?: string;
	projectId?: string;
	nature?: string;
	shape?: string;
	mirrorId?: string;
	testKind?: string;
	certLanguage?: string;
	red?: boolean;
	changeSetRef?: string;
	changeSetStatus?: string;
	parsed?: ParsedSpec;
}

/**
 * proposeMirrorAction is the action-capable control behind the shape-editor surface (CLAUDE.md §7
 * ui-completeness): the human picks a truth-nature, the form is derived, types the source, then
 * submits — the action runs the pure twin (derive + parse + propose) and returns the red mirror + a
 * DRAFT ChangeSet PROPOSAL. It WRITES NOTHING (the wall): the proposal awaits human approval via the
 * changeset door. An unknown nature / unparseable source / missing project is refused with a message.
 */
export async function proposeMirrorAction(
	_prev: ProposeResultView,
	formData: FormData,
): Promise<ProposeResultView> {
	const nature = String(formData.get("nature") ?? "").trim() as TruthNature;
	const reflectsLayer = String(formData.get("reflects") ?? "").trim();
	const source = String(formData.get("source") ?? "");

	const ctx = await activeProjectContext();
	const projectId = ctx.activeId ?? undefined;
	if (!projectId) return { ok: false, messageKey: "noProject" };

	const { draft, error: openErr } = openDraft(
		projectId,
		reflectsLayer,
		"v1",
		nature,
	);
	if (openErr !== null || draft === null) {
		return {
			ok: false,
			messageKey: "proposeRefused",
			error: openErr ?? undefined,
			projectId,
		};
	}
	draft.source = source;

	const { result, error } = proposeMirror(draft, "phase-0");
	if (error !== null || result === null) {
		return {
			ok: false,
			messageKey: "proposeRefused",
			error: error ?? undefined,
			projectId,
		};
	}
	return {
		ok: true,
		messageKey: "proposeOk",
		projectId: result.projectId,
		nature,
		shape: draft.shape,
		mirrorId: result.mirrorId,
		testKind: result.testKind,
		certLanguage: result.certLanguage,
		red: result.red,
		changeSetRef: result.changeSet.ref,
		changeSetStatus: result.changeSet.status,
		parsed: result.parsed,
	};
}

export interface MergeResultView {
	ok: boolean;
	/** i18n key under "shapeEditor.messages". */
	messageKey: string;
	locked?: boolean;
	mergedVersion?: number;
	conflictField?: string;
	valueA?: string;
	valueB?: string;
}

/**
 * mergeEditsAction is the action-capable concurrency control: two authors edit the SAME draft field
 * concurrently — the action runs the pure CRDT merge and returns the verdict. Same value or disjoint
 * fields MERGE (version bumps); a same-field clash LOCKS (DRAFT_EDIT_CONFLICT, both candidates
 * surfaced) — NEVER a silent last-write-wins. This is a draft-level (below-the-wall) conflict.
 */
export async function mergeEditsAction(
	_prev: MergeResultView,
	formData: FormData,
): Promise<MergeResultView> {
	const titleA = String(formData.get("titleA") ?? "");
	const titleB = String(formData.get("titleB") ?? "");

	const ctx = await activeProjectContext();
	const projectId = ctx.activeId ?? "demo-project";
	const { draft } = openDraft(projectId, "Order.discount", "v1", "workflow");
	if (draft === null) return { ok: false, messageKey: "proposeRefused" };

	const r = mergeEdits(
		draft,
		{ author: "alice", baseVersion: 0, title: titleA },
		{ author: "bob", baseVersion: 0, title: titleB },
	);
	if (r.error !== null) {
		const c = r.conflicts[0];
		return {
			ok: false,
			messageKey: "mergeLocked",
			locked: true,
			conflictField: c?.field,
			valueA: c?.valueA,
			valueB: c?.valueB,
		};
	}
	return {
		ok: true,
		messageKey: "mergeMerged",
		locked: false,
		mergedVersion: r.merged.version,
	};
}
