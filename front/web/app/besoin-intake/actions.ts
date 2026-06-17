"use server";

import { allLevels } from "@/lib/besoin-grammar";
import {
	allCaptureProjections,
	BESOIN_READ_TOOLS,
	BESOIN_VALIDATE_TOOLS,
	besoinLevelSchema,
	type CaptureProjection,
	captureProjection,
	type LevelSchema,
} from "@/lib/besoin-intake";
import {
	DEMO_PROJECT,
	demoGraphState,
	gatewaySchemaArgs,
	gatewayStateArgs,
} from "@/lib/besoin-intake-data";
import { readVia, type Source } from "@/lib/gateway-sdk";
import { panelScope } from "@/lib/panelScope";
import { type BesoinGraphState, stateDecoder } from "./live";

/**
 * Server Actions for the /besoin-intake Workbench panel (EL15 — the capability door over the
 * BesoinGraph; ADR 0092 batch-4A flip).
 *
 * THE STEP: besoin-intake is the SINGLE capability door above the BesoinGraph (the NEED store, ABOVE
 * the wall §2 — DISTINCT from the truth-store). The human EXPLAINS their app level by level; each
 * resolved MAPPING rung emits a DRAFT Idea via the legal idea_capture door (EL05); a NoEmit rung
 * (journey/view/invariant) emits NONE (no silent cast). The read/validate tools are pure projections.
 *
 * THE FLIP (ADR 0092 — the Go engine is the SINGLE live source). Before this flip the panel computed
 * its DISPLAYED graph-state from the TS twin directly — the twin WAS the live source. `stateAction` now
 * reads the LIVE graph-state from the Go besoin-intake MCP server through the passerelle
 * (`readVia(scope, "besoin_graph_state", …)`, the dispatched below-the-line read), with the twin
 * fixture (`demoGraphState`) preserved ONLY as the deterministic fallback (`source:"live"|"demo"`). The
 * besoin Store is RLS-scoped to `project`: the panel ALWAYS sends the active project (the scope IS the
 * project boundary the dispatcher routes on, S55). The closed-grammar schema + capture projections are
 * NOT RLS data — they are pure functions of the grammar + the EL05 mapping (the Go `besoin_level_schema`
 * reproduces them byte-for-byte), so they are computed by the twin and ride alongside the live state.
 *
 * THE WALL (CLAUDE.md §2/§9): the read/validate tools are pure below-the-line projections; a capture/
 * emit appends a DRAFT idea via the legal idea_capture door (WroteKernel always false — a kernel write
 * is refused by GRANT). The "propose/capture" write controls stay the propose → ChangeSet → approval
 * voie; this panel's actions ONLY READ. The `readVia` frontier import keeps the T5 cliquet GREEN (the
 * twin sits behind the demo fallback, never as the live source).
 *
 * DETERMINISM-FIRST (CLAUDE.md §6/§8): the decoder + the demo fallback are pure; a malformed /
 * undispatched / refused answer yields the demo graph-state. The gateway args carry a SCALAR project
 * (and a scalar level), never a json.RawMessage body — the S59 transport scar avoided.
 */

/** BesoinStateView — the result the panel renders: the live (or demo) graph-state + its source tag. */
export interface BesoinStateView {
	ran: boolean;
	state: BesoinGraphState;
	source: Source;
}

/** BesoinSchemaView — a single level's closed-grammar schema (computed by the twin; pure). */
export interface BesoinSchemaView {
	ran: boolean;
	level: string;
	schema: LevelSchema | null;
}

/**
 * stateAction reads the LIVE RLS-scoped BesoinGraph state through the passerelle (the dispatched
 * `besoin_graph_state` tool), falling back to the deterministic demo graph-state on any miss. The
 * active project (the cookie scope) IS the RLS boundary the dispatcher routes on (S55).
 */
export async function stateAction(
	_prev: BesoinStateView,
	formData: FormData,
): Promise<BesoinStateView> {
	const project =
		String(formData.get("project") ?? DEMO_PROJECT) || DEMO_PROJECT;
	const scope = await panelScope();
	const { data, source } = await readVia(
		scope,
		"besoin_graph_state",
		gatewayStateArgs(project),
		stateDecoder,
		demoGraphState(project),
	);
	return { ran: true, state: data, source };
}

/**
 * schemaAction reads a level's schema. The level schema is a PURE function of the closed grammar + the
 * EL05 mapping (no RLS data) — the Go `besoin_level_schema` reproduces the twin byte-for-byte — so it is
 * computed by the twin directly (the gatewaySchemaArgs projection documents the live arg shape). No
 * silent invented field: a non-grammar level yields null.
 */
export async function schemaAction(
	_prev: BesoinSchemaView,
	formData: FormData,
): Promise<BesoinSchemaView> {
	const level = String(formData.get("level") ?? "product");
	// gatewaySchemaArgs documents the live `besoin_level_schema` arg shape; the projection itself is the
	// pure grammar twin (the Go MCP reproduces it identically — no RLS, no project, no clock).
	void gatewaySchemaArgs(level);
	return { ran: true, level, schema: besoinLevelSchema(level) };
}

/**
 * captureProjections returns the closed capture surface (one entry per grammar level) — the door's full
 * inventory the panel enumerates (ui-completeness §7). PURE: the EL05 emit/no-emit decision per rung.
 */
export async function captureProjections(): Promise<CaptureProjection[]> {
	return allCaptureProjections();
}

/** projectionAction projects a single level's capture (the tool + the emit/no-emit verdict). PURE. */
export async function projectionAction(
	level: string,
): Promise<CaptureProjection | null> {
	return captureProjection(level);
}

/** grammarLevels returns the closed ordered level set (the select options). PURE — never an LLM. */
export async function grammarLevels(): Promise<string[]> {
	return allLevels();
}

/** readTools returns the closed read/state tool names (the door's read surface). PURE. */
export async function readTools(): Promise<string[]> {
	return [...BESOIN_READ_TOOLS];
}

/** validateTools returns the closed validate tool names (the door's validate surface). PURE. */
export async function validateTools(): Promise<string[]> {
	return [...BESOIN_VALIDATE_TOOLS];
}
