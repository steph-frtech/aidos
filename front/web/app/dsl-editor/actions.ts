"use server";

import type { DslDoc, DslKind } from "@/lib/dsl-editor";
import {
	demoPropose,
	docToArgs,
	dslKindsList,
	type ProposalOutput,
} from "@/lib/dsl-editor-data";
import { readVia, type Source } from "@/lib/gateway-sdk";
import { panelScope } from "@/lib/panelScope";
import { proposalDecoder } from "./live";

/**
 * Server Actions for the /dsl-editor Workbench panel (S77 — « Éditeurs typés (pas de code libre) sur
 * les DSL »).
 *
 * THE STEP (ROADMAP-app-builder S77): typed editors over the four behaviour DSLs — Operation
 * (validate/authorize/read/mutate/return, incl. async/scheduled de S73), Policy (l'arbre ALLOW/DENY),
 * et la verticale Control+Action (visible_when/enabled_when/triggers → invoke operation) — chacun
 * édité comme FORME TYPÉE (pas de code libre) et PROPOSÉ comme ChangeSet DRAFT.
 *
 * THE FLIP (ADR 0092 — the Go engine is the SINGLE live source). `proposeAction` now reads the LIVE
 * proposal from the Go dsl-editor MCP server through the passerelle
 * (`readVia(scope, "dsl_propose", …)`, the dispatched below-the-line read), with the twin
 * `lib/dsl-editor.proposeEdit()` preserved ONLY as the deterministic demo fallback
 * (`lib/dsl-editor-data.demoPropose`, tagged `source:"live"|"demo"`). The `readVia` frontier import
 * keeps the T5 cliquet GREEN (the twin sits behind the demo fallback, never as the live source).
 *
 * THE WALL (§2/§7). Every action WRITES NOTHING: dsl_propose returns a DRAFT ChangeSet VALUE
 * (wrote_kernel ALWAYS false), never applied — le CLI `aidos` l'applique seulement après approbation
 * humaine ; un rejet jette le DRAFT et le kernel n'est jamais touché. Le parsing DSL est une FONCTION
 * PURE côté moteur Go (et le fallback twin), jamais un LLM (determinism-first, §6/§8).
 */

/** The view the panel renders: the FLAT Go proposeOutput projection + the live/demo source tag. */
export interface ProposeView {
	ok: boolean;
	proposal?: ProposalOutput;
	error?: string;
	parseError?: string;
	source?: Source;
}

/** kindList is the action behind the DSL-kind control — the four editable DSLs (the twin's order). */
export async function kindList(): Promise<DslKind[]> {
	return dslKindsList();
}

/**
 * proposeAction is the action-capable control behind the editor (CLAUDE.md §7 ui-completeness): the
 * user picks a DSL kind, fills the TYPED body (no free code) and submits — the action sends the typed
 * edit to the Go engine via the passerelle (`dsl_propose`) and, on success, surfaces the `proposed`
 * (DRAFT) ChangeSet handle the engine returns. A free-code escape or a malformed typed body yields a
 * verbatim S77 error from the engine (the twin demo fallback reproduces the same verdict). It WRITES
 * NOTHING (the wall — wrote_kernel always false).
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
		// A malformed typed body never reaches the engine — it is a client parse error, surfaced
		// verbatim (never a guessed AST). The wall is untouched (no proposal, no write).
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
	const scope = await panelScope();
	// LIVE read through the passerelle (the dispatched dsl-editor `dsl_propose` tool); the twin
	// demoPropose() is the deterministic fallback (source:"live"|"demo") — ADR 0092.
	const { data, source } = await readVia(
		scope,
		"dsl_propose",
		docToArgs(doc, parentPhase),
		proposalDecoder,
		demoPropose(doc, parentPhase),
	);
	if (!data.ok) return { ok: true, error: data.error, source };
	return { ok: true, proposal: data, source };
}

function splitRefs(v: FormDataEntryValue | null): string[] {
	return String(v ?? "")
		.split(",")
		.map((s) => s.trim())
		.filter(Boolean);
}
