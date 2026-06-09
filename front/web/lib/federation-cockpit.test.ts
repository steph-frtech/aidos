import * as fc from "fast-check";
import { describe, expect, it } from "vitest";
import { type DepGraph, measure } from "./arch-fitness";
import type { Project as CellProject, Federation } from "./cell-federation";
import {
	assembleSnapshot,
	type CellViolation,
	DEMO_DEP_GRAPH,
	DEMO_FEDERATION,
	DEMO_PROJECT,
	DEMO_REGRESSED_GRAPH,
	DEMO_WAVE,
	type FanOutSpec,
} from "./federation-cockpit";

/**
 * S105 §50 REPRODUCIBILITY MIRROR (fast-check) — the cockpit assembler is a PURE function: same
 * input ⇒ byte-identical snapshot (determinism), a reddened cell NEVER ships, a green
 * non-reddened cell ALWAYS ships, globally-stable iff every cell ships ∧ the structural ratchet
 * held. It also pins the §50 DONE-CRITERION on the demo: two cells, one contract, a transverse
 * red wave — order ships its green local cut while payment is still red. No LLM, no clock, no rng.
 */

const CELLS = ["order", "payment", "shipping", "billing"];

function genFixture(): fc.Arbitrary<{
	p: CellProject;
	fed: Federation;
	g: DepGraph;
	wave: FanOutSpec;
}> {
	return fc.integer({ min: 1, max: 4 }).chain((n) => {
		const chosen = CELLS.slice(0, n);
		return fc
			.record({
				greens: fc.array(fc.boolean(), { minLength: n, maxLength: n }),
				viols: fc.array(fc.boolean(), { minLength: n, maxLength: n }),
				hasContract: fc.boolean(),
			})
			.map(({ greens, viols, hasContract }) => {
				const nodes = chosen.flatMap((r) => [
					{ id: `${r}-op`, cell: r, kind: "layer" as const },
					{
						id: `${r}-contract`,
						cell: r,
						kind: "contract" as const,
						public: true,
					},
				]);
				const ratchets: Record<string, "green" | "red"> = {};
				const cells: Record<string, number> = {};
				const waveCells: CellViolation[] = [];
				chosen.forEach((r, i) => {
					ratchets[r] = greens[i] ? "green" : "red";
					cells[r] = 2;
					waveCells.push({ cell: r, violates: viols[i] });
				});
				const fed: Federation = { contracts: [] };
				const honored: Array<{ a: string; b: string }> = [];
				if (n >= 2 && hasContract) {
					fed.contracts.push({ a: chosen[0], b: chosen[1], honored: true });
					honored.push({ a: chosen[0], b: chosen[1] });
				}
				const p: CellProject = { id: "p", nodes, ratchets };
				const g: DepGraph = { project: "p", cells, edges: [], honored };
				const wave: FanOutSpec = { policyWaveId: "w0", cells: waveCells };
				return { p, fed, g, wave };
			});
	});
}

describe("S105 federation cockpit — reproducibility mirror", () => {
	it("is deterministic: same input ⇒ identical snapshot", () => {
		fc.assert(
			fc.property(genFixture(), ({ p, fed, g, wave }) => {
				const base = measure(g);
				const a = assembleSnapshot(p, g, base, fed, wave);
				const b = assembleSnapshot(p, g, base, fed, wave);
				expect(a).toEqual(b);
			}),
		);
	});

	it("a reddened cell never ships; a green non-violating cell always ships; global = all-ship ∧ structural-held", () => {
		fc.assert(
			fc.property(genFixture(), ({ p, fed, g, wave }) => {
				const base = measure(g); // candidate == baseline ⇒ structural HELD
				const snap = assembleSnapshot(p, g, base, fed, wave);
				const violates = new Map(wave.cells.map((c) => [c.cell, c.violates]));

				let shipCount = 0;
				let prev = "";
				for (const c of snap.cells) {
					expect(c.cell >= prev).toBe(true); // sorted
					prev = c.cell;
					if (c.reddened) expect(c.ships).toBe(false);
					if (c.behavioural === "green" && !violates.get(c.cell)) {
						expect(c.ships).toBe(true);
					}
					expect(c.reddened).toBe(violates.get(c.cell) ?? false);
					if (c.ships) shipCount++;
				}
				const wantGlobal =
					shipCount === snap.cells.length && snap.structural.state === "HELD";
				expect(snap.globallyStable).toBe(wantGlobal);
			}),
		);
	});

	it("done-criterion: order ships its green local cut while payment is reddened", () => {
		const base = measure(DEMO_DEP_GRAPH);
		const snap = assembleSnapshot(
			DEMO_PROJECT,
			DEMO_DEP_GRAPH,
			base,
			DEMO_FEDERATION,
			DEMO_WAVE,
		);
		expect(snap.cells).toHaveLength(2);
		expect(snap.contracts).toEqual([
			{ a: "order", b: "payment", honored: true },
		]);
		expect(snap.shippableCells).toEqual(["order"]);
		expect(snap.reddenedCells).toEqual(["payment"]);
		expect(snap.globallyStable).toBe(false);
		expect(snap.structural.state).toBe("HELD");

		const payment = snap.cells.find((c) => c.cell === "payment");
		expect(payment?.ships).toBe(false);
		expect(payment?.queue).toHaveLength(1);
		const order = snap.cells.find((c) => c.cell === "order");
		expect(order?.ships).toBe(true);
		expect(order?.behavioural).toBe("green");
	});

	it("a structural regression breaks global stability even with green cells", () => {
		const base = measure(DEMO_DEP_GRAPH);
		const snap = assembleSnapshot(
			DEMO_PROJECT,
			DEMO_REGRESSED_GRAPH,
			base,
			DEMO_FEDERATION,
			{ policyWaveId: "w", cells: [] },
		);
		expect(snap.structural.state).toBe("BROKEN");
		expect(snap.structural.block).toBeDefined();
		expect(snap.shippableCells).toHaveLength(2); // both behavioural cells still ship
		expect(snap.globallyStable).toBe(false); // but the federation is NOT globally stable
	});
});
