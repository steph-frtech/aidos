/**
 * Reproducibility mirror for the ContextRouter twin (lib/context-pack.ts), AIDOS step S33.
 * fast-check (∀) — the SAME invariants the Go rapid property pins: compile is DETERMINISTIC (same
 * input ⇒ identical pack + identical hash); MINIMALITY (every affected layer is in the red-set);
 * staleness/scope exclusion (no stale/out-of-scope/unapproved/below-threshold memory appears);
 * wall-as-boundary (forbidden_paths always contains /kernel/** and /mirror/**); branch-no-leak (no
 * other branch's node enters the cut); stop_condition always non-empty. Plus the canonical
 * checkout-apply-promo done case: includes the checkout subgraph + crossed PaymentGateway@hash,
 * excludes billing internals + stale + out-of-scope memory. Determinism-first: the screen computes
 * the pack from this pure twin, never an LLM and never re-implementing the router.
 */

import fc from "fast-check";
import { describe, expect, it } from "vitest";
import {
	atLeastRepeated,
	type Confidence,
	type ContextGraph,
	compile,
	type Goal,
	type MemoryKind,
} from "./context-pack";
import { CHECKOUT_GOAL, CHECKOUT_GRAPH } from "./context-pack-data";

const arbConf = fc.constantFrom<Confidence>("once", "repeated", "established");
const arbKind = fc.constantFrom<MemoryKind>("lesson", "incident", "glossary");
const arbBC = fc.constantFrom("checkout", "billing", "catalog", "");
const arbBranch = fc.constantFrom("main", "feature/x", "");
const arbId = fc.constantFrom("a", "b", "c", "d", "e", "f");
const arbMemId = fc.constantFrom(
	"m0",
	"m1",
	"m2",
	"m3",
	"m4",
	"m5",
	"m6",
	"m7",
);

const arbGoal: fc.Arbitrary<Goal> = fc.record({
	id: fc.constantFrom("g1", "g2"),
	boundedContext: fc.constantFrom("checkout", "billing"),
	redSet: fc.array(arbId, { maxLength: 4 }),
	allowedPaths: fc.constant(["/src/x/**"]),
});

const arbGraph: fc.Arbitrary<ContextGraph> = fc.record({
	layers: fc.array(
		fc.record({
			id: arbId,
			boundedContext: arbBC,
			branch: arbBranch,
			loadBearing: fc.boolean(),
		}),
		{ maxLength: 6 },
	),
	mirrors: fc.array(
		fc.record({ id: arbId, boundedContext: arbBC, red: fc.boolean() }),
		{
			maxLength: 5,
		},
	),
	contracts: fc.array(
		fc.record({ id: arbId, boundedContext: arbBC, public: fc.boolean() }),
		{
			maxLength: 5,
		},
	),
	memory: fc
		.array(
			fc.record({
				id: arbMemId,
				kind: arbKind,
				scope: arbBC,
				confidence: arbConf,
				stale: fc.boolean(),
				approved: fc.boolean(),
			}),
			{ maxLength: 6 },
		)
		// dedup by id so pack membership by id is unambiguous (the router does not require unique ids)
		.map((rs) => {
			const seen = new Set<string>();
			const out: typeof rs = [];
			for (const r of rs) {
				if (seen.has(r.id)) continue;
				seen.add(r.id);
				out.push(r);
			}
			return out;
		}),
	skills: fc.constant([] as string[]),
	tools: fc.constant([] as string[]),
});

const has = (xs: string[], x: string) => xs.includes(x);

describe("ContextRouter twin — invariants (∀)", () => {
	it("1. is deterministic and content-addressed", () => {
		fc.assert(
			fc.property(arbGoal, arbBranch, arbGraph, (goal, branch, graph) => {
				const p1 = compile(goal, branch, graph);
				const p2 = compile(goal, branch, graph);
				expect(p1.hash).toBe(p2.hash);
				expect(p1.hash).not.toBe("");
				expect(JSON.stringify(p1)).toBe(JSON.stringify(p2));
			}),
		);
	});

	it("2. minimality — every affected layer is in the red-set", () => {
		fc.assert(
			fc.property(arbGoal, arbBranch, arbGraph, (goal, branch, graph) => {
				const p = compile(goal, branch, graph);
				for (const id of p.affectedLayers)
					expect(has(goal.redSet, id)).toBe(true);
			}),
		);
	});

	it("3. memory exclusion — only eligible records appear", () => {
		fc.assert(
			fc.property(arbGoal, arbBranch, arbGraph, (goal, branch, graph) => {
				const p = compile(goal, branch, graph);
				const inPack = (id: string) =>
					has(p.memory.relevantLessons, id) ||
					has(p.memory.recentIncidents, id) ||
					has(p.memory.glossaryTerms, id);
				for (const r of graph.memory) {
					const eligible =
						!r.stale &&
						r.approved &&
						(r.scope === "" || r.scope === goal.boundedContext) &&
						atLeastRepeated(r.confidence);
					if (inPack(r.id)) expect(eligible).toBe(true);
				}
			}),
		);
	});

	it("4. wall-as-boundary — always forbids /kernel/** and /mirror/**", () => {
		fc.assert(
			fc.property(arbGoal, arbBranch, arbGraph, (goal, branch, graph) => {
				const p = compile(goal, branch, graph);
				expect(p.boundaries.forbiddenPaths).toContain("/kernel/**");
				expect(p.boundaries.forbiddenPaths).toContain("/mirror/**");
			}),
		);
	});

	it("5. branch-no-leak — no other branch's node enters the cut", () => {
		fc.assert(
			fc.property(arbGoal, arbBranch, arbGraph, (goal, branch, graph) => {
				const p = compile(goal, branch, graph);
				for (const l of graph.layers) {
					if (
						l.branch !== "" &&
						l.branch !== branch &&
						has(p.affectedLayers, l.id)
					) {
						const sibling = graph.layers.some(
							(o) => o.id === l.id && (o.branch === "" || o.branch === branch),
						);
						expect(sibling).toBe(true);
					}
				}
			}),
		);
	});

	it("6. stop_condition is always non-empty", () => {
		fc.assert(
			fc.property(arbGoal, arbBranch, arbGraph, (goal, branch, graph) => {
				expect(compile(goal, branch, graph).stopCondition).not.toBe("");
			}),
		);
	});
});

describe("ContextRouter twin — the checkout-apply-promo done case", () => {
	it("includes the checkout subgraph + crossed PaymentGateway@hash", () => {
		const p = compile(CHECKOUT_GOAL, "main", CHECKOUT_GRAPH);
		expect(p.affectedLayers.sort()).toEqual(
			["control:promo-field", "operation:applyPromo", "view:cart"].sort(),
		);
		expect(p.activeKernel.mirrors).toContain("promo-field.fixture");
		expect(p.activeKernel.mirrors).toContain("applyPromo.workflow");
		expect(p.activeKernel.mirrors).toContain("canPlaceOrder.property");
		expect(p.activeKernel.contracts).toContain("PaymentGateway@hash");
		expect(p.activeKernel.contracts).toContain("checkout-api@hash");
		expect(p.memory.relevantLessons).toContain("idempotency-for-payment");
		expect(p.memory.recentIncidents).toContain("out-of-stock-incident");
	});

	it("excludes billing internals, stale + out-of-scope memory, and another branch's node", () => {
		const p = compile(CHECKOUT_GOAL, "main", CHECKOUT_GRAPH);
		expect(p.affectedLayers).not.toContain("billing:invoice-internals");
		expect(p.affectedLayers).not.toContain("view:cart-v2"); // branch-no-leak
		expect(p.activeKernel.mirrors).not.toContain("billing.dunning.fixture");
		expect(p.activeKernel.contracts).not.toContain("billing-internal@hash");
		const allMem = [
			...p.memory.relevantLessons,
			...p.memory.recentIncidents,
			...p.memory.glossaryTerms,
		];
		expect(allMem).not.toContain("old-promo-rule");
		expect(allMem).not.toContain("refund-window");
		// exclusion reasons rendered
		const reason = (id: string) => p.excluded.find((e) => e.id === id)?.reason;
		expect(reason("billing:invoice-internals")).toBe("cross-BC");
		expect(reason("old-promo-rule")).toBe("stale");
		expect(reason("refund-window")).toBe("out-of-scope");
	});
});
