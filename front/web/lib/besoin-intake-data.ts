/**
 * besoin-intake-data — the DETERMINISTIC demo fixtures for the /besoin-intake panel (EL15; the ADR
 * 0092 batch-4A flip). It holds the canonical per-level besoin_level_schema projection, a sample
 * capture body per rung, the gateway-arg projections, and the twin compute of them — the demo
 * snapshots the panel falls back to when the gateway is unreachable (`source:"demo"`).
 *
 * THE TWIN IS NOW THE DEMO, NOT THE LIVE PATH (ADR 0092). Before this flip /besoin-intake computed
 * its displayed level-schema + capture projection from the TS twin `lib/besoin-intake` directly — the
 * twin WAS the live source. The flip routes every control through the Go besoin-intake MCP server via
 * the passerelle (`readVia(scope, "besoin_graph_state" | "besoin_level_schema" | "besoin_list" |
 * "besoin_capture_*" | "besoin_validate_level" | "besoin_classify" | "besoin_emit_ideas" |
 * "besoin_red_backlog" | "besoin_capitalise", …)`, the dispatched below-the-line reads); these
 * fixtures are KEPT only as the deterministic fallback. The presence of this `-data.ts` sibling is
 * ALSO what makes the T5 cliquet (twin-as-live-fitness) RECOGNISE `lib/besoin-intake` as a twin — the
 * panel stays GREEN because it imports the `readVia` frontier (the witness the twin sits behind
 * `source:"demo"`).
 *
 * THE RLS DIMENSION (the point of this batch). The Go besoin-intake server is the ONLY DSN-backed
 * batch-4A server: its `besoin` Store is RLS-scoped to `project` (the SET LOCAL `aidos.project` GUC,
 * S55 — project A's rows are invisible to a B-scoped session). The panel therefore ALWAYS sends the
 * active `project` in its gateway args (the scope IS the project boundary the wall enforces); the
 * dispatcher routes with Target.ProjectID = the active project. These demo fixtures carry a sample
 * project so the fallback renders the same shape the live RLS-scoped read yields.
 *
 * DETERMINISM-FIRST (CLAUDE.md §6/§8): the level-schema + capture projection are PURE functions of the
 * closed grammar + the EL05 mapping — the same level → byte-identical projection (the Go MCP
 * reproduces them; no LLM enters). The body fields are an OBJECT (map), NOT a json.RawMessage
 * byte-array, so the real HTTP args:{object} payload survives the round-trip (the S59 scar avoided).
 *
 * THE WALL (CLAUDE.md §2): the read/validate tools are pure projections; the capture/emit tools append
 * a DRAFT idea via the legal idea_capture door (EL05/EL16) — WroteKernel always false (a kernel write
 * is refused by GRANT). Promotion stays the /goal flow (S64).
 */

import { allLevels, type Level } from "./besoin-grammar";
import {
	allCaptureProjections,
	besoinLevelSchema,
	type CaptureProjection,
	captureProjection,
	type LevelSchema,
} from "./besoin-intake";
import type { Source } from "./gateway-sdk";

/** The canonical demo project the panel scopes its calls to (the RLS boundary). */
export const DEMO_PROJECT = "shop-a";

/** The canonical metadata that makes a node verifiable (records rather than routing to /spike). */
export const DEMO_META = {
	truth_kind: "behavioral",
	verifiability: "deterministic",
	global_scope: true,
} as const;

/** A sample capture body per SOURCE rung — the shape the panel sends to the Go capture tools. */
export const SAMPLE_BODY_BY_LEVEL: Partial<
	Record<Level, Record<string, unknown>>
> = {
	product: { intent: "app A", scenarios: ["s1"], selects: ["journey-a"] },
	journey: { gherkin: "Given … When … Then …", selects: ["view-a"] },
	view: {
		goal: "afficher le panier",
		zones: ["liste", "total"],
		selects: ["control-a"],
	},
	control: {
		label: "Payer",
		visible_when: "$.cart.items > 0",
		selects: ["action-a"],
	},
	action: { binds: "createOrder", on_success: "redirect:/merci" },
	operation: {
		name: "createOrder",
		emits: ["OrderPlaced"],
		selects: ["entity-a"],
	},
	entity: { attributes: ["id", "total"] },
};

/** demoLevelSchema — the twin besoin_level_schema of a level (the demo schema the panel renders). */
export function demoLevelSchema(level: string): LevelSchema | null {
	return besoinLevelSchema(level);
}

/** demoCaptureProjections — the twin capture projection for every grammar level (the door's surface). */
export function demoCaptureProjections(): CaptureProjection[] {
	return allCaptureProjections();
}

/** demoLevelSchemas — every grammar level's schema (the full demo projection the panel falls back to). */
export function demoLevelSchemas(): LevelSchema[] {
	return allLevels()
		.map((l) => besoinLevelSchema(l))
		.filter((s): s is LevelSchema => s !== null);
}

/**
 * gatewayStateArgs maps the active project to the Go `besoin_graph_state` / `besoin_list` arg shape
 * (`project`). PURE projection — the project IS the RLS boundary the dispatcher routes on. A scalar
 * object — no json.RawMessage body, the S59 transport scar avoided.
 */
export function gatewayStateArgs(
	project: string = DEMO_PROJECT,
): Record<string, unknown> {
	return { project };
}

/** gatewaySchemaArgs maps a level to the Go `besoin_level_schema` arg shape (`level`). PURE. */
export function gatewaySchemaArgs(level: string): Record<string, unknown> {
	return { level };
}

/**
 * gatewayCaptureArgs maps a (project, level, utterance) to the Go `besoin_capture_*` arg shape: the
 * project (RLS), the rung-shaped body (an OBJECT — map[string]any on the Go side, NOT a byte-array),
 * the verbatim utterance (provenance), and the four metadata. PURE projection, never an LLM.
 */
export function gatewayCaptureArgs(
	project: string,
	level: Level,
	utterance: string,
	body: Record<string, unknown> = SAMPLE_BODY_BY_LEVEL[level] ?? {},
): Record<string, unknown> {
	return { project, utterance, body, meta: { ...DEMO_META } };
}

/** gatewayValidateArgs maps a (project, level) to the Go `besoin_validate_level`/`besoin_classify` args. */
export function gatewayValidateArgs(
	project: string,
	level: string,
): Record<string, unknown> {
	return { project, level, meta: { ...DEMO_META } };
}

/** gatewayEmitArgs maps a (project, dryRun) to the Go `besoin_emit_ideas` arg shape. PURE. */
export function gatewayEmitArgs(
	project: string = DEMO_PROJECT,
	dryRun = true,
): Record<string, unknown> {
	return { project, dry_run: dryRun, meta: { ...DEMO_META } };
}

/** gatewayBacklogArgs maps a project to the Go `besoin_red_backlog` arg shape (READ-ONLY). PURE. */
export function gatewayBacklogArgs(
	project: string = DEMO_PROJECT,
): Record<string, unknown> {
	return { project, meta: { ...DEMO_META } };
}

/** gatewayCapitaliseArgs maps a (project, reuseAgainst) to the Go `besoin_capitalise` arg shape. PURE. */
export function gatewayCapitaliseArgs(
	project: string = DEMO_PROJECT,
	reuseAgainst = "",
): Record<string, unknown> {
	const args: Record<string, unknown> = { project };
	if (reuseAgainst) args.reuse_against = reuseAgainst;
	return args;
}

/** A typed source-tagged demo graph state (the shape a readVia decoder yields on the demo path). */
export interface BesoinSnapshot {
	project: string;
	enterableLevel: string;
	nodeRowCount: number;
	schemas: LevelSchema[];
	captures: CaptureProjection[];
	source: Source;
}

/**
 * demoSnapshot — the full demo besoin-intake snapshot the panel renders when the gateway is
 * unreachable. A fresh project: zero rows, `product` is the enterable level (the twin's pure verdict),
 * the full closed grammar surface. Identical in shape to the live RLS-scoped read (`source:"demo"`).
 */
export function demoSnapshot(project: string = DEMO_PROJECT): BesoinSnapshot {
	return {
		project,
		enterableLevel: "product",
		nodeRowCount: 0,
		schemas: demoLevelSchemas(),
		captures: demoCaptureProjections(),
		source: "demo",
	};
}

/**
 * demoGraphState — the DETERMINISTIC demo `besoin_graph_state` fixture (the BesoinGraphState shape the
 * `stateDecoder` produces). It is the fallback `readVia(scope, "besoin_graph_state", …)` returns when
 * the gateway is unreachable (`source:"demo"`): a FRESH project — zero rows, `product` is the enterable
 * level (the twin's pure EL07 verdict), the need not yet done, no per-level verdicts. Byte-identical in
 * SHAPE to the live RLS-scoped read; the live read carries the project's REAL persisted rows + hash.
 *
 * The return type is the front BesoinGraphState (inferred from `stateDecoder` via Decoded<> in live.ts);
 * here we shape it as a plain record so this fixture stays decoupled from the route module (the panel
 * imports the typed `BesoinGraphState` from the route's live.ts and assigns this demo to it).
 */
export function demoGraphState(project: string = DEMO_PROJECT): {
	project: string;
	graphHash: string;
	nodeRowCount: number;
	enterableLevel: string;
	done: boolean;
	verdicts: never[];
} {
	return {
		project,
		graphHash: "",
		nodeRowCount: 0,
		enterableLevel: "product",
		done: false,
		verdicts: [],
	};
}

// captureProjection re-export keeps the per-level helper reachable from the panel without a second import.
export { captureProjection };
