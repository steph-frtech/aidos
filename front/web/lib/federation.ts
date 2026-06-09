/**
 * The federation composition twin — the Workbench /federation source (AIDOS S103, §51).
 *
 * The DECLARED projection of the Go package back/runtime/federation: the COMPOSITION layer
 * that wires the cross-cell invariant kinds (S48 GlobalInvariant, S49 SagaInvariant, S50
 * TemporalInvariant) onto REAL MULTIPLE cells (S100) and the runtime red-wave (S22):
 *
 *   - sagaOverCells — the canonical saga (payment_captured ⇒ order_confirmed ∨ compensation)
 *     over two REAL contracted cells; a broken leg triggers compensation; a non-contracted
 *     pair is refused (CROSS_CELL_NO_CONTRACT).
 *   - fanOut — a GLOBAL policy expressed once fans out to a RedWorkQueue PER CELL; the cells
 *     that do NOT violate the policy stay GREEN ("les cellules non affectées restent vertes").
 *
 * DETERMINISM-FIRST (CLAUDE.md §6/§8): every function is a PURE function of its input — no
 * clock, no rng, no I/O, no LLM. The Go output is the AUTHORITATIVE truth; this twin reproduces
 * it for the screen so the panel shows a live, deterministic result. The reproducibility mirror
 * lib/federation.test.ts (fast-check) pins determinism + the non-affected-cell-stays-green
 * invariant + the broken-leg-compensates invariant.
 *
 * READ-ONLY (the wall): /federation COMPOSES; it never writes truth. The per-cell RedWorkQueue
 * rows are a VALUE; the actual INSERT is the S22 hook's job below the waterline.
 */

export type SagaLeg = "happy" | "compensated" | "violated";

export interface BlockReason {
	code: string;
	severity: string;
	explanation: string;
	howToFix: string[];
}

export interface SagaParticipant {
	cell: string;
	/** the events this participant commits on success (e.g. order_confirmed). */
	commits: string[];
	/** the compensation legs (operation refs id@version) run when the participant is undone. */
	compensation: string[];
}

export interface SagaRun {
	leg: SagaLeg;
	finalTrace: string[];
	outcome: "satisfied" | "violated";
	compensation: string[];
	accessBlock?: BlockReason;
}

/** A federation contract between two cells (a contracts_with link), honored iff Pact verifies. */
export interface Contract {
	a: string;
	b: string;
	honored: boolean;
}

const CODE_CROSS_CELL_NO_CONTRACT = "CROSS_CELL_NO_CONTRACT";

/** connects reports whether the contract links x and y in either direction AND is honored. */
function honoredBetween(contracts: Contract[], x: string, y: string): boolean {
	if (x === y) return true; // own cell always passes
	return contracts.some(
		(c) => c.honored && ((c.a === x && c.b === y) || (c.a === y && c.b === x)),
	);
}

/**
 * The canonical KRD §49.2 saga property over a trace, encoded EXACTLY as the Go
 * sagas.Evaluate: `payment_captured implies (order_confirmed or compensation_executed)`.
 * A captured payment with neither confirmation nor compensation is violated.
 */
function sagaSatisfied(trace: string[]): boolean {
	const has = (e: string) => trace.includes(e);
	if (!has("payment_captured")) return true; // antecedent false ⇒ vacuously satisfied
	return has("order_confirmed") || has("compensation_executed");
}

/**
 * RunCompensation reproduces the Go sagas.RunCompensation: for each participant whose commit
 * landed (in REVERSE order), append its declared compensation legs, then the terminal
 * compensation_executed marker. Returns the compensation events + the settled trace.
 */
function runCompensation(
	participants: SagaParticipant[],
	failed: string[],
): { events: string[]; trace: string[] } {
	const events: string[] = [];
	for (let i = participants.length - 1; i >= 0; i--) {
		const p = participants[i];
		const committed = p.commits.some((c) => failed.includes(c));
		if (!committed) continue;
		for (const leg of p.compensation) events.push(leg);
	}
	events.push("compensation_executed");
	return { events, trace: [...failed, "compensation_executed"] };
}

/**
 * sagaOverCells runs the canonical saga over a federation of REAL cells (§51). A non-contracted
 * participant pair is refused; the happy path is satisfied; a broken leg triggers compensation,
 * after which the saga is satisfied VIA compensation. PURE, deterministic. Mirrors the Go
 * federation.SagaOverCells.
 */
export function sagaOverCells(
	participants: SagaParticipant[],
	contracts: Contract[],
	trace: string[],
): SagaRun {
	if (participants.length >= 2) {
		const from = participants[0].cell;
		const to = participants[1].cell;
		if (!honoredBetween(contracts, from, to)) {
			return {
				leg: "violated",
				finalTrace: trace,
				outcome: "violated",
				compensation: [],
				accessBlock: {
					code: CODE_CROSS_CELL_NO_CONTRACT,
					severity: "blocking",
					explanation: `Les cellules « ${from} » et « ${to} » ne sont pas liées par un contrat honoré : la saga n'a aucun canal transverse implicite (S100).`,
					howToFix: ["declare_a_contracts_with_link", "honor_the_pact_pair"],
				},
			};
		}
	}

	if (sagaSatisfied(trace)) {
		return {
			leg: "happy",
			finalTrace: trace,
			outcome: "satisfied",
			compensation: [],
		};
	}
	const comp = runCompensation(participants, trace);
	const settled = sagaSatisfied(comp.trace);
	return {
		leg: settled ? "compensated" : "violated",
		finalTrace: comp.trace,
		outcome: settled ? "satisfied" : "violated",
		compensation: comp.events,
	};
}

// ── global-policy fan-out ──

export interface CellViolation {
	cell: string;
	/** whether this cell actually breaks the global policy. A non-violating cell stays green. */
	violates: boolean;
}

export interface CellRedWave {
	cell: string;
	reddened: boolean;
	/** the cell's OWN RedWorkQueue rows (here: one target ref per violating cell). */
	queue: string[];
}

/**
 * fanOut reproduces the Go federation.FanOut: a GLOBAL policy expressed once fans out across
 * the cells it SPANS; for each spanned cell that actually VIOLATES the policy it materialises
 * that cell's OWN RedWorkQueue (a single target row here, stamped with the policy wave id); a
 * spanned-but-non-violating cell stays GREEN with an empty queue (§51). PURE, deterministic.
 *
 * `spannedCells` is the policy's reach (globalinvariant.RedWave over the federation policy = all
 * the declared cells). A cell outside the reach is not the policy's concern.
 */
export function fanOut(
	spannedCells: string[],
	policyWaveId: string,
	cells: CellViolation[],
): CellRedWave[] {
	const inReach = new Set(spannedCells);
	const out: CellRedWave[] = cells.map((cv) => {
		if (inReach.has(cv.cell) && cv.violates) {
			return {
				cell: cv.cell,
				reddened: true,
				queue: [`${cv.cell}::pii-aggregate@${policyWaveId}`],
			};
		}
		return { cell: cv.cell, reddened: false, queue: [] };
	});
	return out.sort((x, y) => (x.cell < y.cell ? -1 : x.cell > y.cell ? 1 : 0));
}

/** affectedCells projects a fan-out result to the cells it actually reddened (canonical order). */
export function affectedCells(waves: CellRedWave[]): string[] {
	return waves
		.filter((w) => w.reddened)
		.map((w) => w.cell)
		.sort();
}

// ── demo fixtures (the §51 canonical scenario the panel boots with) ──

export const DEMO_PARTICIPANTS: SagaParticipant[] = [
	{
		cell: "order",
		commits: ["order_confirmed"],
		compensation: ["cancelOrder@v2"],
	},
	{
		cell: "payment",
		commits: ["payment_captured"],
		compensation: ["refundPayment@v3"],
	},
];

export const DEMO_CONTRACTS: Contract[] = [
	{ a: "order", b: "payment", honored: true },
];

export const DEMO_POLICY_CELLS = ["order", "payment", "shipping"];

export const DEMO_VIOLATIONS: CellViolation[] = [
	{ cell: "order", violates: true },
	{ cell: "payment", violates: true },
	{ cell: "shipping", violates: false },
];
