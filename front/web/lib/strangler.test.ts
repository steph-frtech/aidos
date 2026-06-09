import fc from "fast-check";
import { describe, expect, it } from "vitest";
import {
	CODE_CHARACTERIZATION_DRIFT,
	CODE_CONTRACT_BROKEN,
	CODE_NO_OBSERVED_BEHAVIOUR,
	carve,
	DEMO_DRIFTING,
	DEMO_LEGACY,
	DEMO_PRESERVING,
	freeze,
	type Legacy,
	type RefactorObservation,
	refactor,
} from "./strangler";

// S104 §50 REPRODUCIBILITY MIRROR (fast-check) — the front twin reproduces the Go strangler-fig:
// carve/freeze/refactor are PURE (same input ⇒ same output); freezing a cell's OWN behaviour and
// replaying it is ALWAYS accepted (a no-op refactor never reddens); changing ANY output is ALWAYS
// caught (the characterization net never lets a behaviour change through); a broken contract is
// ALWAYS refused.

describe("carve + freeze (the demo)", () => {
	it("carves the billing legacy and freezes one characterization mirror per trace", () => {
		const { cell, error } = carve(DEMO_LEGACY);
		expect(error).toBeUndefined();
		expect(cell).toBeDefined();
		const mirrors = freeze(cell!);
		expect(mirrors).toHaveLength(3);
		for (const m of mirrors) {
			expect(m.characterization).toBe(true);
			expect(m.testKind).toBe("fixture");
			expect(m.id).not.toBe("");
		}
	});

	it("refuses a legacy with no observed behaviour", () => {
		const { error } = carve({ ...DEMO_LEGACY, observed: [] });
		expect(error).toBe(CODE_NO_OBSERVED_BEHAVIOUR);
	});
});

describe("refactor (the done-criterion)", () => {
	it("a behaviour-preserving refactor stays green and is accepted (contract honored)", () => {
		const { cell } = carve(DEMO_LEGACY);
		const mirrors = freeze(cell!);
		const v = refactor(cell!, mirrors, DEMO_PRESERVING);
		expect(v.allGreen).toBe(true);
		expect(v.contractHonored).toBe(true);
		expect(v.accepted).toBe(true);
		expect(v.block).toBeUndefined();
	});

	it("a refactor that changes an observable output is refused (drift caught)", () => {
		const { cell } = carve(DEMO_LEGACY);
		const mirrors = freeze(cell!);
		const v = refactor(cell!, mirrors, DEMO_DRIFTING);
		expect(v.accepted).toBe(false);
		expect(v.block?.code).toBe(CODE_CHARACTERIZATION_DRIFT);
		expect(v.mirrors.filter((m) => !m.green)).toHaveLength(1);
	});

	it("a behaviour-preserving refactor that breaks the contract is refused", () => {
		const { cell } = carve(DEMO_LEGACY);
		const mirrors = freeze(cell!);
		const obs: RefactorObservation = {
			...DEMO_PRESERVING,
			contractHonored: false,
		};
		const v = refactor(cell!, mirrors, obs);
		expect(v.allGreen).toBe(true);
		expect(v.accepted).toBe(false);
		expect(v.block?.code).toBe(CODE_CONTRACT_BROKEN);
	});
});

// A generator of observable legacies: a named cell, 1..6 distinct traces.
const legacyArb: fc.Arbitrary<Legacy> = fc
	.record({
		cell: fc.stringMatching(/^[a-z]{3,8}$/),
		count: fc.integer({ min: 1, max: 6 }),
		pub: fc.boolean(),
	})
	.map(({ cell, count, pub }) => ({
		cell,
		internalNodes: [`${cell}.a`, `${cell}.b`],
		publishedContract: pub ? `${cell}.contract.v1` : undefined,
		observed: Array.from({ length: count }, (_, i) => ({
			name: `case-${i}`,
			input: { v: i },
			output: { r: i * 7 },
		})),
	}));

describe("property mirrors", () => {
	it("carve is deterministic (same legacy ⇒ identical cell + hash)", () => {
		fc.assert(
			fc.property(legacyArb, (l) => {
				const a = carve(l).cell!;
				const b = carve(l).cell!;
				expect(JSON.stringify(a)).toBe(JSON.stringify(b));
				expect(a.hash).toBe(b.hash);
			}),
		);
	});

	it("freeze-then-replay is ALWAYS accepted (a no-op refactor never reddens)", () => {
		fc.assert(
			fc.property(legacyArb, (l) => {
				const sc = carve(l).cell!;
				const mirrors = freeze(sc);
				const outputs: Record<string, unknown> = {};
				for (const t of sc.observed) outputs[t.name] = t.output;
				const v = refactor(sc, mirrors, { outputs, contractHonored: true });
				expect(v.accepted).toBe(true);
				expect(v.allGreen).toBe(true);
				expect(v.block).toBeUndefined();
			}),
		);
	});

	it("changing ANY one output is ALWAYS caught (drift refused)", () => {
		fc.assert(
			fc.property(legacyArb, (l) => {
				const sc = carve(l).cell!;
				const mirrors = freeze(sc);
				const outputs: Record<string, unknown> = {};
				for (const t of sc.observed) outputs[t.name] = t.output;
				// drift the first scenario.
				const target = sc.observed[0].name;
				outputs[target] = { r: -1 };
				const v = refactor(sc, mirrors, { outputs, contractHonored: true });
				expect(v.accepted).toBe(false);
				expect(v.allGreen).toBe(false);
				expect(v.block?.code).toBe(CODE_CHARACTERIZATION_DRIFT);
				expect(v.mirrors.find((m) => m.scenario === target)?.green).toBe(false);
			}),
		);
	});
});
