/**
 * lib/besoin-branchtree.test.ts — the EL12 TS-twin reproducibility mirror (vitest + fast-check).
 * Pins the twin byte-equivalent to the Go authority: branchTree / isResolved / classifyAltitude are
 * pure, deterministic, order-independent, and obey the schema-mismatch law (CLAUDE.md §6/§8).
 */

import fc from "fast-check";
import { describe, expect, it } from "vitest";
import {
	type Altitude,
	antiVacuitySatisfied,
	branchTree,
	classifyAltitude,
	isOffAltitude,
	isResolved,
	type LevelBody,
	matchesSchema,
	openBranches,
} from "./besoin-branchtree";
import { allLevels } from "./besoin-grammar";

function completeBodyFor(level: string): LevelBody {
	switch (level) {
		case "product":
			return {
				intent: "x",
				scenarios: ["s1", "s2"],
				selects: ["onboarding", "core-task"],
			};
		case "journey":
			return { gherkin: "Given a When b Then c", selects: ["list"] };
		case "view":
			return { goal: "g", zones: ["z"], data: ["d"], selects: ["submit"] };
		case "control":
			return {
				visible_when: true,
				enabled_when: true,
				triggers: "action:x@v1",
				selects: ["command"],
			};
		case "action":
			return { invoke: "operation:x@v1", selects: ["update"] };
		case "operation":
			return { steps: ["a"], fixture: { state: "s" } };
		case "entity":
			return { attributes: ["id"] };
		case "invariant":
			return { statement: "∀ x" };
		case "policy":
			return { rule: "r" };
		default:
			return {};
	}
}

describe("branchTree (EL12 per-level decision tree)", () => {
	it("leaves ≥1 branch open for an empty body, on every grammar level", () => {
		for (const l of allLevels()) {
			const tree = branchTree(l, {});
			expect(tree.length, l).toBeGreaterThan(0);
			expect(openBranches(tree).length, l).toBeGreaterThan(0);
		}
	});

	it("closes every branch for a complete body, on every grammar level", () => {
		for (const l of allLevels()) {
			const tree = branchTree(l, completeBodyFor(l));
			expect(openBranches(tree), l).toEqual([]);
			expect(isResolved(tree), l).toBe(true);
			expect(antiVacuitySatisfied(tree), l).toBe(true);
		}
	});

	it("leaves the precise required-field branch open when that field is missing", () => {
		const tree = branchTree("product", { intent: "x" }); // scenarios missing
		const b = tree.find(
			(x) => x.kind === "required_field" && x.field === "scenarios",
		);
		expect(b).toBeDefined();
		expect(b?.closed).toBe(false);
		expect(b?.howToFix.length).toBeGreaterThan(0);
	});

	it("leaves the anti-vacuity branch open for a parsable-but-non-constraining product", () => {
		const tree = branchTree("product", {
			intent: "x",
			scenarios: ["s1"],
			selects: [],
		});
		expect(isResolved(tree)).toBe(false);
		expect(antiVacuitySatisfied(tree)).toBe(false);
	});

	it("returns no tree for a non-grammar level (fail-closed)", () => {
		expect(branchTree("nonsense", { x: 1 })).toEqual([]);
	});
});

describe("classifyAltitude (schema-mismatch)", () => {
	it("classifies an entity body submitted at product as OFF-altitude → entity", () => {
		const entityBody = { attributes: ["id", "title"] };
		expect(isOffAltitude("product", entityBody)).toBe(true);
		expect(matchesSchema("product", entityBody)).toBe(false);
		const a = classifyAltitude(entityBody);
		expect(a.matched).toBe(true);
		expect(a.best).toBe("entity");
	});

	it("classifies a well-shaped product body as on-altitude at product", () => {
		const body = completeBodyFor("product");
		expect(isOffAltitude("product", body)).toBe(false);
		expect(classifyAltitude(body).best).toBe("product");
	});

	it("returns matched=false for a body matching no schema", () => {
		expect(classifyAltitude({ garbage: "noise" }).matched).toBe(false);
	});
});

// --- reproducibility properties (fast-check) ----------------------------------------------------

const KEYS = [
	"intent",
	"scenarios",
	"gherkin",
	"goal",
	"zones",
	"data",
	"visible_when",
	"enabled_when",
	"triggers",
	"invoke",
	"steps",
	"fixture",
	"attributes",
	"statement",
	"rule",
	"selects",
	"noise",
];

const arbBody = fc
	.array(
		fc.tuple(
			fc.constantFrom(...KEYS),
			fc.oneof(
				fc.string(),
				fc.boolean(),
				fc.array(
					fc.constantFrom("onboarding", "core-task", "list", "submit", "x"),
				),
			),
		),
	)
	.map((pairs) => {
		const o: LevelBody = {};
		for (const [k, v] of pairs) o[k] = v;
		return o;
	});

const arbLevel = fc.constantFrom(...allLevels());

describe("EL12 reproducibility (same input → same output)", () => {
	it("branchTree is deterministic", () => {
		fc.assert(
			fc.property(arbLevel, arbBody, (l, body) => {
				expect(branchTree(l, body)).toEqual(branchTree(l, body));
			}),
		);
	});

	it("branchTree is sorted by (kind, field)", () => {
		fc.assert(
			fc.property(arbLevel, arbBody, (l, body) => {
				const tree = branchTree(l, body);
				for (let i = 1; i < tree.length; i++) {
					const p = tree[i - 1];
					const c = tree[i];
					expect(
						p.kind < c.kind || (p.kind === c.kind && p.field <= c.field),
					).toBe(true);
				}
			}),
		);
	});

	it("classifyAltitude is deterministic and consistent with matchesSchema", () => {
		fc.assert(
			fc.property(arbBody, (body) => {
				const a: Altitude = classifyAltitude(body);
				expect(a).toEqual(classifyAltitude(body));
				if (a.matched) {
					expect(matchesSchema(a.best, body)).toBe(true);
					expect(isOffAltitude(a.best, body)).toBe(false);
				}
			}),
		);
	});

	it("isOffAltitude negates matchesSchema on every grammar level", () => {
		fc.assert(
			fc.property(arbLevel, arbBody, (l, body) => {
				expect(isOffAltitude(l, body)).toBe(!matchesSchema(l, body));
			}),
		);
	});
});
