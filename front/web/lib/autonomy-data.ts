/**
 * autonomy-data — the DETERMINISTIC demo fixture for the /autonomy panel (kill-twins batch-2,
 * ADR 0092). It holds the FK10 demonstration scenarios (the ENFORCE fixtures — a declared level +
 * an attempted action — and the PROMOTE fixtures — a current level + an AgentRun history), the
 * projection of a scenario to the Go `enforce` / `promote` tool wire shapes (`gatewayEnforceArgs`
 * / `gatewayPromoteArgs`), and the twin compute (`demoEnforce` / `demoPromote`) the panel falls
 * back to when the gateway is unreachable (`source:"demo"`).
 *
 * THE TWIN IS NOW THE DEMO, NOT THE LIVE PATH (ADR 0092). Before the cutover /autonomy computed its
 * displayed verdict + promoted level from the TS twin `lib/autonomy` (`enforce`,
 * `promotionFromHistory`) directly — the twin WAS the live source. The cutover routes
 * `enforceAction` / `promoteAction` through the Go engine via the passerelle
 * (`readVia(scope, "enforce"|"promote", …)`, the dispatched below-the-line reads of the autonomy
 * MCP server); this fixture is KEPT only as the deterministic fallback. The presence of THIS
 * `-data.ts` sibling is also what makes the T5 cliquet (twin-as-live-fitness) RECOGNISE
 * `lib/autonomy` as a twin — the panel stays GREEN because `actions.ts` imports the `readVia`
 * frontier (the witness the twin sits behind `source:"demo"`).
 *
 * DETERMINISM-FIRST (CLAUDE.md §6/§8): the demo verdict/level is the same PURE twin compute the Go
 * `autonomy.Enforce` / `autonomy.PromotionFromHistory` reproduce — same input → same verdict / same
 * level. The parity mirror app/autonomy/live.test.ts pins the decoder shape == the Go
 * enforceOut/promoteOut contract. THE WALL (§2): a scenario is a read input; the verdict + the
 * proposed level are projections, never a truth — freezing a promotion stays idea → mirror → /goal.
 */

import {
	type Action,
	DEFAULT_POLICY,
	enforce,
	type Level,
	promotionFromHistory,
	type RunOutcome,
	levelLabel as twinLevelLabel,
} from "./autonomy";

/** levelLabel — the canonical "A<n>" renderer, re-exported HERE so the panel reads its display
 *  helper from the demo data file (a panel value-importing `@/lib/autonomy` would red the T5
 *  cliquet — the live path is the Go engine via readVia, not the twin). Pure passthrough. */
export function levelLabel(l: number): string {
	return twinLevelLabel(l);
}

// ── ENFORCE scenarios ────────────────────────────────────────────────────────────────────────

/** An ENFORCE scenario: a declared autonomy level + the attempted action. */
export interface ActionScenario {
	id: string;
	label: string;
	declared: Level;
	action: Action;
}

/** The canonical FK10 enforce demonstrations (the A1→merge fixture done-criterion + three more). */
export const ACTION_SCENARIOS: ActionScenario[] = [
	{
		id: "a1-merge",
		label: "A1 → merge (A6, critique)",
		declared: 1,
		action: { name: "merge", required: 6, critical: true },
	},
	{
		id: "a6-merge",
		label: "A6 → merge (A6, critique)",
		declared: 6,
		action: { name: "merge", required: 6, critical: true },
	},
	{
		id: "a8-critical",
		label: "A8 → action critique A8 (jamais)",
		declared: 8,
		action: { name: "irreversible", required: 8, critical: true },
	},
	{
		id: "a3-read",
		label: "A3 → lecture (A0)",
		declared: 3,
		action: { name: "read", required: 0, critical: false },
	},
];

/** findActionScenario resolves an enforce scenario by id (the panel's select value). */
export function findActionScenario(id: string): ActionScenario | undefined {
	return ACTION_SCENARIOS.find((s) => s.id === id);
}

/**
 * gatewayEnforceArgs projects an enforce scenario to the Go `enforce` tool input
 * (autonomysrv.enforceIn): { declared, action, required, critical }. PURE — a deterministic
 * projection, never an LLM.
 */
export function gatewayEnforceArgs(s: ActionScenario): Record<string, unknown> {
	return {
		declared: s.declared,
		action: s.action.name,
		required: s.action.required,
		critical: s.action.critical,
	};
}

/** The shape the /autonomy enforce read renders — the front projection of the Go `enforceOut`. */
export interface EnforceSnapshot {
	allowed: boolean;
	declared: string;
	required: string;
	critical: boolean;
	code?: string;
	severity?: string;
	explanation?: string;
	howToFix?: string[];
}

/**
 * demoEnforce is the deterministic demo EnforceSnapshot — the twin `enforce()` of a scenario,
 * shaped to the Go `enforceOut` wire form (the level labels via `Level.String()` == levelLabel).
 * It is the `source:"demo"` fallback the panel renders when the gateway is unreachable,
 * byte-identical in SHAPE to the Go-authoritative live snapshot.
 */
export function demoEnforce(s: ActionScenario): EnforceSnapshot {
	const dec = enforce(s.declared, s.action);
	const snap: EnforceSnapshot = {
		allowed: dec.allowed,
		declared: levelLabel(s.declared),
		required: levelLabel(s.action.required),
		critical: s.action.critical,
	};
	if (dec.blockReason) {
		snap.code = dec.blockReason.code;
		snap.severity = dec.blockReason.severity;
		snap.explanation = dec.blockReason.explanation;
		snap.howToFix = dec.blockReason.howToFix;
	}
	return snap;
}

// ── PROMOTE scenarios ────────────────────────────────────────────────────────────────────────

/** A PROMOTE scenario: a current level + an AgentRun history (oldest→newest). */
export interface HistoryScenario {
	id: string;
	label: string;
	current: Level;
	history: RunOutcome[];
}

const g = (evidence: number, incident = false): RunOutcome => ({
	green: true,
	evidence,
	incident,
});

/** The canonical FK10 promote demonstrations (a clean window earns it; an incident / a sub-E4 run
 *  withholds it — the level is COMPUTED, never declared). */
export const HISTORY_SCENARIOS: HistoryScenario[] = [
	{
		id: "clean",
		label: "A1 · 3 runs verts E4+ sans incident",
		current: 1,
		history: [g(4), g(5), g(4)],
	},
	{
		id: "incident",
		label: "A1 · un incident dans la fenêtre",
		current: 1,
		history: [g(4), g(4, true), g(4)],
	},
	{
		id: "below-e4",
		label: "A1 · un run sous E4 (E3)",
		current: 1,
		history: [g(4), g(3), g(4)],
	},
];

/** findHistoryScenario resolves a promote scenario by id (the panel's select value). */
export function findHistoryScenario(id: string): HistoryScenario | undefined {
	return HISTORY_SCENARIOS.find((s) => s.id === id);
}

/**
 * gatewayPromoteArgs projects a promote scenario to the Go `promote` tool input
 * (autonomysrv.promoteIn): { current, history:[{green,evidence,incident}] } (the bar fields default
 * to the FKE-34 policy server-side, so we omit min_green_runs / min_evidence). PURE.
 */
export function gatewayPromoteArgs(
	s: HistoryScenario,
): Record<string, unknown> {
	return {
		current: s.current,
		history: s.history.map((r) => ({
			green: r.green,
			evidence: r.evidence,
			incident: r.incident,
		})),
	};
}

/** The shape the /autonomy promote read renders — the front projection of the Go `promoteOut`. */
export interface PromoteSnapshot {
	current: string;
	promoted: string;
	earned: boolean;
	windowN: number;
	minEvidence: string;
	historyLen: number;
}

/** evidenceName mirrors the Go prooftype.ELevel.Name() for the default floor (E4) — the only floor
 *  the demo fixtures exercise (the bar defaults to E4 server-side). */
function evidenceName(level: number): string {
	return `E${level}`;
}

/**
 * demoPromote is the deterministic demo PromoteSnapshot — the twin `promotionFromHistory()` of a
 * scenario under the default FKE-34 bar, shaped to the Go `promoteOut` wire form. It is the
 * `source:"demo"` fallback the panel renders when the gateway is unreachable, byte-identical in
 * SHAPE to the Go-authoritative live snapshot.
 */
export function demoPromote(s: HistoryScenario): PromoteSnapshot {
	const promoted = promotionFromHistory(s.current, s.history, DEFAULT_POLICY);
	return {
		current: levelLabel(s.current),
		promoted: levelLabel(promoted),
		earned: promoted > s.current,
		windowN: DEFAULT_POLICY.minGreenRuns,
		minEvidence: evidenceName(DEFAULT_POLICY.minEvidence),
		historyLen: s.history.length,
	};
}
