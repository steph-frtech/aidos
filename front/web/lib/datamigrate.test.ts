/**
 * The S95 data-migration twin reproducibility + no-loss mirror (fast-check — the frozen front
 * property slot). It pins the same done-criteria as the Go rapid mirror:
 *   1. reproducibility — same change → byte-identical plan (id + steps);
 *   2. no-loss — every accepted plan stages backfill BEFORE contract (preservesAllData);
 *   3. the breaking gate — a breaking change with NO backfill is ALWAYS refused
 *      (BREAKING_MIGRATION_NO_BACKFILL), never a plan;
 *   4. content-address sensitivity — distinct changes → distinct plan ids;
 *   5. expand→backfill→contract shape — every accepted plan has the three forward-only stages;
 *   6. malformed change refusal — a non-widening cardinality / unknown strategy is refused.
 * Same input → same output, on every run.
 */
import fc from "fast-check";
import { describe, expect, it } from "vitest";
import {
	buildPlan,
	type Change,
	type ChangeKind,
	type DataTruthScope,
	isBlock,
} from "./datamigrate";

const backfill: DataTruthScope = {
	appliesTo: ["existing_records"],
	migrationRequired: true,
	strategy: "expand_contract",
	preserveOldTruth: true,
};

const ident = fc.stringMatching(/^[a-z]{3,8}$/);
const kind = fc.constantFrom<ChangeKind>("rename", "split", "cardinality");

function bodyFor(k: ChangeKind, names: string[]): Partial<Change> {
	if (k === "rename")
		return {
			rename: { entity: names[0], from: names[1], to: names[2], type: "text" },
		};
	if (k === "split")
		return {
			split: {
				source: names[0],
				newEntity: names[1],
				column: names[2],
				type: "text",
			},
		};
	return {
		cardinality: {
			source: names[0],
			target: names[1],
			relation: names[2],
			from: "1-N",
			to: "N-N",
		},
	};
}

const renameArb = fc.tuple(ident, ident, ident, ident).map(
	([p, e, f, t]): Change => ({
		project: `app-${p}`,
		kind: "rename",
		rename: { entity: e, from: f, to: t, type: "text" },
		scope: backfill,
	}),
);

describe("S95 datamigrate twin", () => {
	it("1. reproducible: same change → identical plan id + steps", () => {
		fc.assert(
			fc.property(renameArb, (c) => {
				const a = buildPlan(c);
				const b = buildPlan(c);
				expect(isBlock(a)).toBe(false);
				if (isBlock(a) || isBlock(b)) return;
				expect(a.id).toBe(b.id);
				expect(a.steps).toEqual(b.steps);
			}),
		);
	});

	it("2. no-loss: every accepted plan stages backfill before contract", () => {
		fc.assert(
			fc.property(kind, fc.tuple(ident, ident, ident), (k, names) => {
				const c: Change = {
					project: "app",
					kind: k,
					scope: backfill,
					...bodyFor(k, names),
				};
				const p = buildPlan(c);
				expect(isBlock(p)).toBe(false);
				if (isBlock(p)) return;
				expect(p.preservesAllData).toBe(true);
				let seenBackfill = false;
				for (const s of p.steps) {
					if (s.stage === "backfill") seenBackfill = true;
					if (s.stage === "contract") expect(seenBackfill).toBe(true);
				}
			}),
		);
	});

	it("3. breaking gate: a breaking change with no backfill is always refused", () => {
		fc.assert(
			fc.property(renameArb, (c) => {
				const p = buildPlan({ ...c, scope: undefined });
				expect(isBlock(p)).toBe(true);
				if (isBlock(p)) expect(p.code).toBe("BREAKING_MIGRATION_NO_BACKFILL");
			}),
		);
	});

	it("4. content-address sensitivity: distinct changes → distinct plan ids", () => {
		fc.assert(
			fc.property(renameArb, (c) => {
				const a = buildPlan(c);
				const b = buildPlan({
					...c,
					rename: { ...c.rename!, to: `${c.rename!.to}x` },
				});
				if (isBlock(a) || isBlock(b)) return;
				expect(a.id).not.toBe(b.id);
			}),
		);
	});

	it("5. shape: every accepted plan is expand → backfill → contract", () => {
		fc.assert(
			fc.property(kind, fc.tuple(ident, ident, ident), (k, names) => {
				const c: Change = {
					project: "app",
					kind: k,
					scope: backfill,
					...bodyFor(k, names),
				};
				const p = buildPlan(c);
				if (isBlock(p)) return;
				expect(p.steps.map((s) => s.stage)).toEqual([
					"expand",
					"backfill",
					"contract",
				]);
			}),
		);
	});

	it("6. malformed change refusal: a non-widening cardinality is refused", () => {
		const p = buildPlan({
			project: "app",
			kind: "cardinality",
			cardinality: {
				source: "order",
				target: "label",
				relation: "tag",
				from: "1-1",
				to: "N-N",
			},
			scope: backfill,
		});
		expect(isBlock(p)).toBe(true);
		if (isBlock(p)) expect(p.code).toBe("OUT_OF_SCOPE");
	});
});
