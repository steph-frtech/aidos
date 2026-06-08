"use server";

import {
	type DslDoc,
	type DslKind,
	kinds,
	type Proposal,
	proposeEdit,
} from "@/lib/dsl-editor";

/**
 * Server Actions for the /dsl-editor Workbench panel (S77 — « Éditeurs typés (pas de code libre) sur
 * les DSL »).
 *
 * THE STEP (ROADMAP-app-builder S77): typed editors over the four behaviour DSLs — Operation
 * (validate/authorize/read/mutate/return, incl. async/scheduled de S73), Policy (l'arbre ALLOW/DENY),
 * et la verticale Control+Action (visible_when/enabled_when/triggers → invoke operation) — chacun
 * édité comme FORME TYPÉE (pas de code libre) et PROPOSÉ comme ChangeSet DRAFT.
 *
 * THE WALL (§2/§7). Every action WRITES NOTHING: it parses the typed edit and PROPOSES a DRAFT
 * changeset — le CLI `aidos` l'applique seulement après approbation humaine ; un rejet jette le DRAFT
 * et le kernel n'est jamais touché. Le parsing DSL est une FONCTION PURE (lib/dsl-editor), jamais un
 * LLM (determinism-first, §6/§8).
 */

export interface ProposeView {
	ok: boolean;
	proposal?: Proposal;
	error?: string;
	parseError?: string;
}

/** kindList is the action behind the DSL-kind control — the four editable DSLs. */
export async function kindList(): Promise<DslKind[]> {
	return kinds();
}

/**
 * proposeAction is the action-capable control behind the editor (CLAUDE.md §7 ui-completeness): the
 * user picks a DSL kind, fills the TYPED body (no free code) and submits — the action PARSES the typed
 * edit and, on success, PRODUCES a `proposed` (DRAFT) ChangeSet carrying the canonical AST. A
 * free-code escape or a malformed typed body yields a verbatim S77 error (never a guessed AST). It
 * WRITES NOTHING (the wall).
 */
export async function proposeAction(
	_prev: ProposeView,
	formData: FormData,
): Promise<ProposeView> {
	const kind = String(formData.get("kind") ?? "policy").trim() as DslKind;
	const name = String(formData.get("name") ?? "").trim();
	const parentPhase = String(formData.get("parentPhase") ?? "phase-0").trim();
	const rawBody = String(formData.get("body") ?? "{}");
	const knownActions = splitRefs(formData.get("knownActions"));
	const knownControls = splitRefs(formData.get("knownControls"));
	const knownOperations = splitRefs(formData.get("knownOperations"));

	let body: Record<string, unknown>;
	try {
		body = JSON.parse(rawBody) as Record<string, unknown>;
	} catch (e) {
		return {
			ok: true,
			parseError: `dsleditor: le corps typé n'est pas un JSON valide : ${(e as Error).message}`,
		};
	}

	const doc: DslDoc = {
		kind,
		name,
		body,
		knownActions,
		knownControls,
		knownOperations,
	};
	const proposal = proposeEdit(doc, parentPhase);
	if (!proposal.ok) return { ok: true, error: proposal.error };
	return { ok: true, proposal };
}

function splitRefs(v: FormDataEntryValue | null): string[] {
	return String(v ?? "")
		.split(",")
		.map((s) => s.trim())
		.filter(Boolean);
}
