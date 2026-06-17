/**
 * dsl-editor-data — the DETERMINISTIC demo fixtures for the /dsl-editor panel (S77; the ADR 0092
 * batch-3 flip — the Go engine is the SINGLE live source). It holds the gateway-arg projection of a
 * typed editor doc (the args the panel sends to the Go `dsl_propose` / `dsl_parse` tools) and the
 * twin `proposeEdit()` compute of it, projected onto the Go server's FLAT `proposeOutput` contract —
 * the demo `ProposalOutput` the panel falls back to when the gateway is unreachable (`source:"demo"`).
 *
 * THE TWIN IS NOW THE DEMO, NOT THE LIVE PATH (ADR 0092). Before this flip /dsl-editor parsed +
 * proposed its displayed ChangeSet from the TS twin `lib/dsl-editor.proposeEdit()` directly in
 * actions.ts — the twin WAS the live source. The flip routes `proposeAction` through the Go engine
 * via the passerelle (`readVia(scope, "dsl_propose", …)`, the dispatched below-the-line read of the
 * dsl-editor MCP server); this fixture is KEPT only as the deterministic fallback.
 *
 * THE -DATA SIBLING IS THE CLIQUET WITNESS. The presence of this `lib/dsl-editor-data.ts` sibling is
 * what makes the T5 cliquet (lib/twin-as-live-fitness.twinNamesFromLibDir) RECOGNISE
 * `lib/dsl-editor.ts` as a twin-LOGIQUE — the panel stays GREEN because `app/dsl-editor/actions.ts`
 * imports the `readVia` frontier (the witness the twin sits behind `source:"demo"`) and
 * `DslEditorPanel.tsx` value-imports NO twin (it reads its runtime kinds list from THIS data module,
 * which is a demo fixture, not a twin). Without this sibling the cliquet would never see the twin and
 * the flip would not be guarded.
 *
 * DETERMINISM-FIRST (CLAUDE.md §6/§8): the demo proposal is the same PURE twin compute the Go
 * `dsleditor.ProposeEdit` reproduces — same typed doc → byte-identical DRAFT ChangeSet ref. The
 * parity mirror app/dsl-editor/live.test.ts pins the decoders' shape == the Go proposeOutput /
 * parseOutput contract.
 *
 * THE WALL (CLAUDE.md §2): every tool is a PURE READ — dsl_propose returns a DRAFT ChangeSet VALUE
 * (WroteKernel always false, never applied); these fixtures and the panel WRITE NOTHING. Freezing the
 * edited source into the kernel stays the /goal flow.
 */

import {
	DSL_KINDS,
	type DslDoc,
	type DslKind,
	type Parsed,
	proposeEdit,
} from "./dsl-editor";

/**
 * dslKindsList re-exports the four editable DSL kinds as a runtime VALUE the client panel reads
 * WITHOUT value-importing the twin (a demo-data module is not a twin — no `*-data-data.ts` sibling).
 * The canonical order is the twin's DSL_KINDS; the parity mirror pins it == the Go `dsl_kinds` output.
 */
export function dslKindsList(): DslKind[] {
	return [...DSL_KINDS];
}

/**
 * ProposalOutput is the SINGLE shape both the live decoder (decoding the Go `proposeOutput`) and the
 * demo fallback produce — the FLAT projection the Go server returns: the parsed kind/name, the DRAFT
 * ChangeSet handle (ref + status) and the wrote_kernel flag (ALWAYS false, the wall). The panel
 * display is identical whether `source` is "live" or "demo".
 */
export interface ProposalOutput {
	ok: boolean;
	error?: string;
	kind?: DslKind;
	name?: string;
	changesetRef?: string;
	changesetStatus?: string;
	wroteKernel: boolean;
}

/**
 * docToArgs maps a front DslDoc to the Go `dsl_propose` / `dsl_parse` argument object (docInput,
 * snake_case): the kind, name, the TYPED body OBJECT (the S59 RawMessage-scar guard — the Go server
 * wraps Body as a map[string]any OBJECT schema, so the body rides as an object, never a string), the
 * known-refs lists, and the parent phase. PURE — a deterministic projection, never an LLM.
 */
export function docToArgs(
	d: DslDoc,
	parentPhase: string,
): Record<string, unknown> {
	return {
		kind: d.kind,
		name: d.name,
		body: d.body,
		known_actions: d.knownActions ?? [],
		known_controls: d.knownControls ?? [],
		known_operations: d.knownOperations ?? [],
		parent_phase: parentPhase,
	};
}

/**
 * demoPropose is the deterministic demo ProposalOutput — the twin `proposeEdit()` of the typed doc,
 * projected onto the Go server's FLAT proposeOutput contract (kind/name/changeset_ref/status + the
 * always-false wrote_kernel). It is identical in shape to the live decoded read (the twin sits behind
 * `source:"demo"`). A parse/propose failure projects to `{ ok:false, error }` (never a guessed AST).
 */
export function demoPropose(d: DslDoc, parentPhase: string): ProposalOutput {
	const p = proposeEdit(d, parentPhase);
	if (!p.ok || !p.parsed || !p.changeset) {
		return { ok: false, error: p.error, wroteKernel: false };
	}
	// The twin's ChangeSetView has no content-addressed id (the Go ChangeSet.ID is authoritative); the
	// demo handle is the deterministic spec_delta target, the same project-scoped ref the Go uses.
	return {
		ok: true,
		kind: p.parsed.kind,
		name: p.parsed.name,
		changesetRef: p.changeset.spec_delta.target,
		changesetStatus: p.changeset.status,
		wroteKernel: false,
	};
}

/**
 * demoParsed is the deterministic demo Parsed preview — the twin `proposeEdit().parsed` of a typed
 * doc. The /dsl-editor panel surfaces the parsed kind/name; the canonical AST is the Go `dsl_parse`
 * tool's output. Re-exported for the parity mirror's round-trip assertion.
 */
export function demoParsed(d: DslDoc, parentPhase: string): Parsed | undefined {
	return proposeEdit(d, parentPhase).parsed;
}
