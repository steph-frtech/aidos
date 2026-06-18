import {
	buildCockpit,
	type CockpitState,
	type Mode,
	type PromotionGate,
} from "./ai-lab";
import {
	type ConsciousnessReport,
	reconcile,
	type SourcedVerdict,
} from "./conscience";
import {
	type Column,
	type Facet,
	NON_FUNCTIONAL_COLUMNS,
	RUNGS,
	wireSkeleton,
} from "./facetwire";

/**
 * ai-lab-data.ts — the /ai-lab (FK11 cockpit) DEMONSTRATION data + the gateway `build_cockpit`
 * args builder (kill-twins cutover, ADR 0092).
 *
 * THE TWIN BEHIND THE FALLBACK. Before the cutover, `loadCockpitAction` composed the cockpit by
 * calling the front twin `lib/ai-lab.buildCockpit(reconcile(...))` directly (the live source). After
 * the cutover the action reads the LIVE cockpit from the Go ai-lab MCP server through the passerelle
 * (`readVia(scope, "build_cockpit", …)`); this module keeps the SAME pure twin compute ONLY as the
 * deterministic demo fallback (`source:"live"|"demo"`) and supplies the gateway call's args. The Go
 * `ailab.BuildCockpit` over `conscience.Reconcile` is the authoritative source — this twin merely
 * reproduces it for the fallback (AUCUN NOUVEAU JUGE).
 *
 * DETERMINISM-FIRST (§6/§8): every export is a PURE function of its scenario inputs — same scenario
 * → same columns + verdicts + demo cockpit. THE WALL (§2): all reads — the cockpit is a projection.
 */

/** The raw inputs of a cockpit scenario: the FK08 facet skeleton (which evidence rung, if any, is
 *  broken) + the extra sourced verdicts of the existing judges (FK09). The SINGLE source the
 *  gateway args AND the demo twin are both projected from (never double-authored). */
export interface CockpitScenario {
	id: string;
	label: string;
	/** the facet whose `6-evidence` rung is unproven (the broken hard facet), or null = all proven. */
	broken: Facet | null;
	/** the extra sourced verdicts the judges contributed (runner/completeness/sensor…). */
	verdicts: SourcedVerdict[];
}

const runnerGreen: SourcedVerdict = {
	source: "runner",
	facet: "F",
	pair: "s2↔s9",
	verdict: "green",
};
const completenessGreen: SourcedVerdict = {
	source: "completeness",
	facet: "F",
	pair: "completeness",
	verdict: "green",
};
/** a BELOW-the-line sensor verdict (read-only from the cockpit) — so the wall is drawn both sides. */
const sensorGreen: SourcedVerdict = {
	source: "sensor",
	facet: "F",
	pair: "latency-meter",
	verdict: "green",
};
const runnerRed: SourcedVerdict = {
	source: "runner",
	facet: "F",
	pair: "s2↔s9",
	verdict: "red",
	drift: "semantic_drift",
	detail: "le code accepte 31 jours ; le contrat dit 30",
	blast: "medium",
};

/** The FK11 cockpit scenarios: aligned, a runner drift (red wave + card), a broken hard facet. */
export const COCKPIT_SCENARIOS: CockpitScenario[] = [
	{
		id: "aligned",
		label: "Tout aligné — voyants verts, aucune carte",
		broken: null,
		verdicts: [runnerGreen, completenessGreen, sensorGreen],
	},
	{
		id: "runner-drift",
		label: "Drift du runner (s2↔s9) 🔴 — sa decision card + red wave",
		broken: null,
		verdicts: [runnerRed, completenessGreen, sensorGreen],
	},
	{
		id: "break-security",
		label: "Casser une paire de S (Sécurité) 🔴 — carte de blocage",
		broken: "S",
		verdicts: [runnerGreen, sensorGreen],
	},
];

export function findCockpitScenario(id: string): CockpitScenario | undefined {
	return COCKPIT_SCENARIOS.find((s) => s.id === id);
}

/** The promotion gate (DROITE, FK10) shown in the cockpit — a declared, deterministic sample. */
export const SAMPLE_GATE: PromotionGate = {
	level: 2,
	canPromote: false,
	nextLevel: 3,
};

/** scenarioColumns rebuilds the FK08 facet skeleton columns of a scenario — every non-functional
 *  facet, every rung declared, evidence proven unless the facet is the broken one (the §FK08 shape
 *  the Go `build_cockpit` re-reconciles internally). */
function scenarioColumns(broken: Facet | null): Column[] {
	return NON_FUNCTIONAL_COLUMNS.map((facet: Facet) => ({
		kernel_id: "checkout",
		facet,
		rungs: RUNGS.map((rung) => ({
			rung,
			declared: true,
			proven: !(facet === broken && rung === "6-evidence"),
		})),
	}));
}

/** scenarioReport reconciles a scenario into the front ConsciousnessReport (the twin path). */
function scenarioReport(sc: CockpitScenario): ConsciousnessReport {
	return reconcile({
		kernel_id: "checkout",
		skeleton: wireSkeleton({
			kernel_id: "checkout",
			columns: scenarioColumns(sc.broken),
		}),
		verdicts: sc.verdicts,
	});
}

/**
 * gatewayBuildCockpitArgs projects a scenario into the Go `build_cockpit` tool arguments — the raw
 * FK08 columns + the sourced verdicts + the cockpit mode + the FK10 autonomy level (so the Go
 * server re-reconciles + composes the SAME cockpit the twin would). The field names match the Go
 * `reportIn`/`buildCockpitIn` jsonschema (rung/declared/proven, facet, autonomy_level).
 */
export function gatewayBuildCockpitArgs(
	sc: CockpitScenario,
	mode: Mode,
): Record<string, unknown> {
	return {
		kernel_id: "checkout",
		mode,
		autonomy_level: SAMPLE_GATE.level,
		columns: scenarioColumns(sc.broken).map((c) => ({
			facet: c.facet,
			rungs: c.rungs.map((r) => ({
				rung: r.rung,
				declared: r.declared,
				proven: r.proven,
			})),
		})),
		verdicts: sc.verdicts.map((v) => ({
			source: v.source,
			facet: v.facet,
			pair: v.pair,
			verdict: v.verdict,
			...(v.drift ? { drift: v.drift } : {}),
			...(v.detail ? { detail: v.detail } : {}),
			...(v.blast ? { blast: v.blast } : {}),
		})),
	};
}

/**
 * demoCockpit composes the deterministic demo cockpit of a scenario via the PURE front twin (the
 * fallback when the gateway is unavailable / refused / undispatched). Same compute the Go engine
 * reproduces (AUCUN NOUVEAU JUGE).
 */
export function demoCockpit(sc: CockpitScenario, mode: Mode): CockpitState {
	return buildCockpit({
		report: scenarioReport(sc),
		mode,
		gate: SAMPLE_GATE,
	});
}
