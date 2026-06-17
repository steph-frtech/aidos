/**
 * conscience-data — the DETERMINISTIC demo fixture for the /conscience panel (kill-twins batch,
 * ADR 0092). It holds the FK09 reconciliation scenarios (a kernel's FK08 facet COLUMNS + the extra
 * sourced verdicts of the existing judges), the projection of a scenario to the Go `reconcile` tool
 * wire shape (`gatewayReconcileArgs`), and the twin `reconcile()` of a scenario as the demo
 * `ConsciousnessReport` the panel falls back to when the gateway is unreachable (`source:"demo"`).
 *
 * THE TWIN IS NOW THE DEMO, NOT THE LIVE PATH (ADR 0092). Before the cutover /conscience computed
 * its displayed report from the TS twin `lib/conscience.reconcile()` directly — the twin WAS the
 * live source. The cutover routes `reconcileAction` through the Go engine via the passerelle
 * (`readVia(scope, "reconcile", …)`, the dispatched below-the-line read of the conscience MCP
 * server); this fixture is KEPT only as the deterministic fallback. The presence of this `-data.ts`
 * sibling is also what makes the T5 cliquet (twin-as-live-fitness) RECOGNISE `lib/conscience` as a
 * twin — the panel stays GREEN because `actions.ts` imports the `readVia` frontier (the witness the
 * twin sits behind `source:"demo"`).
 *
 * DETERMINISM-FIRST (CLAUDE.md §6/§8): the demo report is the same PURE twin compute the Go
 * `conscience.Reconcile` reproduces — same input → same report. The parity mirror
 * app/conscience/live.test.ts pins the decoder shape == the Go reportOut contract. THE WALL (§2):
 * a scenario is a read input; the report is a projection, never a truth.
 */

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

/** A scenario is the RAW conscience input (kernel + facet columns + sourced verdicts) — the same
 *  data the Go `reconcile` tool consumes AND, after wiring, the twin demo compute consumes. */
export interface Scenario {
	id: string;
	label: string;
	kernelId: string;
	columns: Column[];
	verdicts: SourcedVerdict[];
}

const KERNEL = "checkout";

/** alignedColumns: every non-functional facet, every rung declared AND proven (no divergence). */
function alignedColumns(): Column[] {
	return NON_FUNCTIONAL_COLUMNS.map((facet: Facet) => ({
		kernel_id: KERNEL,
		facet,
		rungs: RUNGS.map((rung) => ({ rung, declared: true, proven: true })),
	}));
}

/** brokenColumns: every facet aligned EXCEPT `broken`, whose 6-evidence rung is declared-not-proven
 *  (the broken pair → the column reddens; X stays advisory, §13.6). */
function brokenColumns(broken: Facet): Column[] {
	return NON_FUNCTIONAL_COLUMNS.map((facet: Facet) => ({
		kernel_id: KERNEL,
		facet,
		rungs: RUNGS.map((rung) => ({
			rung,
			declared: true,
			proven: !(facet === broken && rung === "6-evidence"),
		})),
	}));
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

/** The four FK09 demonstration scenarios (aligned · runner drift · broken security · broken X). */
export const SCENARIOS: Scenario[] = [
	{
		id: "aligned",
		label: "Tout aligné — aucune decision card",
		kernelId: KERNEL,
		columns: alignedColumns(),
		verdicts: [runnerGreen, completenessGreen],
	},
	{
		id: "runner-drift",
		label: "Drift du runner (s2↔s9) — produit sa decision card",
		kernelId: KERNEL,
		columns: alignedColumns(),
		verdicts: [
			{
				source: "runner",
				facet: "F",
				pair: "s2↔s9",
				verdict: "red",
				drift: "semantic_drift",
				detail: "le code accepte 31 jours ; le contrat dit 30",
				blast: "medium",
			},
			completenessGreen,
		],
	},
	{
		id: "break-security",
		label: "Casser une paire de S (Sécurité) — carte de blocage",
		kernelId: KERNEL,
		columns: brokenColumns("S"),
		verdicts: [runnerGreen],
	},
	{
		id: "break-experience",
		label: "Casser une paire de X (Expérience) — carte advisory, reste aligné",
		kernelId: KERNEL,
		columns: brokenColumns("X"),
		verdicts: [runnerGreen],
	},
];

/** findScenario resolves a scenario by id (the panel's select value). */
export function findScenario(id: string): Scenario | undefined {
	return SCENARIOS.find((s) => s.id === id);
}

/**
 * gatewayReconcileArgs projects a scenario to the Go `reconcile` tool input
 * (consciencesrv.reconcileIn): the kernel_id, the RAW facet columns (facet letter + declared/proven
 * rungs — the Go server calls facetwire.WireSkeleton itself, so we send the rungs, NOT a wired
 * skeleton), and the extra sourced verdicts verbatim. PURE — a deterministic projection, never an
 * LLM.
 */
export function gatewayReconcileArgs(s: Scenario): Record<string, unknown> {
	return {
		kernel_id: s.kernelId,
		columns: s.columns.map((c) => ({
			facet: c.facet,
			rungs: c.rungs.map((r) => ({
				rung: r.rung,
				declared: r.declared,
				proven: r.proven,
			})),
		})),
		verdicts: s.verdicts.map((v) => ({
			source: v.source,
			facet: v.facet,
			pair: v.pair,
			verdict: v.verdict,
			drift: v.drift,
			detail: v.detail,
			blast: v.blast,
		})),
	};
}

/**
 * demoReport is the deterministic demo ConsciousnessReport — the twin `reconcile()` of a scenario
 * (the FK08 columns wired to a skeleton + the sourced verdicts). It is the `source:"demo"` fallback
 * the panel renders when the gateway is unreachable, byte-identical in SHAPE to the Go-authoritative
 * live report.
 */
export function demoReport(s: Scenario): ConsciousnessReport {
	return reconcile({
		kernel_id: s.kernelId,
		skeleton: wireSkeleton({ kernel_id: s.kernelId, columns: s.columns }),
		verdicts: s.verdicts,
	});
}
