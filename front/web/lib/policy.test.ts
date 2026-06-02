import fc from "fast-check";
import { describe, expect, it } from "vitest";
import {
	CAN_PLACE_ORDER,
	evaluate,
	flatten,
	holds,
	isRuleKind,
	isScope,
	type Policy,
	RULE_KINDS,
	SCOPES,
	sampleById,
	sampleDecision,
} from "./policy";

/**
 * Reproducibility mirror (Vitest + fast-check): reflects=lib/policy,
 * test_kind=property+fixture, liveness=live, authority=below.
 *
 * Pins the /policy projection against the Go invariants (back/kernel/policy):
 *   - the rule-kind set and the scope set match the Go registries;
 *   - canPlaceOrder is the §93 anchor (ALLOW iff the three conditions, else DENY);
 *   - the combination law: any failing child under an ALLOW gate ⇒ DENY;
 *   - not(not(rule)) ≡ rule (Not is an involution);
 *   - evaluate is deterministic and total (same ctx ⇒ same Decision, no throw).
 * It is a MEANS-test toward the human red, below the line — not a new truth.
 */

describe("Policy DSL — closed grammar (mirrors back/kernel/policy)", () => {
	it("pins the eight rule kinds in canonical order", () => {
		expect(RULE_KINDS).toEqual([
			"all",
			"any",
			"not",
			"eq",
			"gt",
			"lt",
			"exists",
			"matches",
		]);
	});

	it("pins the four scopes in canonical order", () => {
		expect(SCOPES).toEqual(["RESOURCE", "OPERATION", "ENTITY", "FIELD"]);
	});

	it("the canPlaceOrder anchor is the §93 shape, verbatim", () => {
		expect(CAN_PLACE_ORDER.name).toBe("canPlaceOrder");
		expect(CAN_PLACE_ORDER.scope).toBe("OPERATION");
		expect(CAN_PLACE_ORDER.target).toBe("createOrder");
		expect(CAN_PLACE_ORDER.effect).toBe("ALLOW");
		expect(CAN_PLACE_ORDER.rule.kind).toBe("all");
	});

	it("rejects a non-rule kind / non-scope", () => {
		expect(isRuleKind("spawn")).toBe(false);
		expect(isScope("GLOBAL")).toBe(false);
	});
});

describe("Policy DSL — canPlaceOrder verdicts (mirrors the fixture mirror)", () => {
	it("ALLOW: authed user, matching non-empty cart", () => {
		expect(sampleDecision(sampleById("allow-authed-matching-cart"))).toBe(
			"ALLOW",
		);
	});

	it("DENY: no auth user", () => {
		expect(sampleDecision(sampleById("deny-no-auth"))).toBe("DENY");
	});

	it("DENY: empty cart", () => {
		expect(sampleDecision(sampleById("deny-empty-cart"))).toBe("DENY");
	});

	it("flatten exposes the typed rule tree (all > exists/eq/gt)", () => {
		const flat = flatten(CAN_PLACE_ORDER.rule);
		expect(flat[0]).toMatchObject({ depth: 0, kind: "all" });
		expect(flat.some((n) => n.kind === "exists")).toBe(true);
		expect(flat.some((n) => n.kind === "eq")).toBe(true);
		expect(flat.some((n) => n.kind === "gt")).toBe(true);
	});
});

describe("Policy DSL — invariants (∀)", () => {
	it("ALLOW iff the three §93 conditions (mirrors the rapid property)", () => {
		fc.assert(
			fc.property(
				fc.boolean(),
				fc.constantFrom("u1", "u2"),
				fc.constantFrom("u1", "u2", "other"),
				fc.integer({ min: 0, max: 3 }),
				(hasUser, userId, cartUserId, nItems) => {
					const ctx: Record<string, unknown> = {
						cart: {
							userId: cartUserId,
							items: Array.from({ length: nItems }, (_, i) => ({ id: i })),
						},
						auth: hasUser ? { user: { id: userId } } : {},
					};
					const want = hasUser && userId === cartUserId && nItems > 0;
					const dec = evaluate(CAN_PLACE_ORDER, ctx);
					expect(dec === "ALLOW").toBe(want);
					if (!want) expect(dec).toBe("DENY");
				},
			),
		);
	});

	it("any failing child under an ALLOW gate ⇒ DENY (combination law)", () => {
		fc.assert(
			fc.property(
				fc.array(fc.boolean(), { minLength: 1, maxLength: 5 }),
				(truths) => {
					const children = truths.map((t) =>
						t
							? ({
									kind: "eq",
									left: { kind: "lit", value: 1 },
									right: { kind: "lit", value: 1 },
								} as const)
							: ({
									kind: "eq",
									left: { kind: "lit", value: 1 },
									right: { kind: "lit", value: 0 },
								} as const),
					);
					const p: Policy = {
						name: "t",
						scope: "OPERATION",
						target: "x",
						effect: "ALLOW",
						rule: { kind: "all", children: [...children] },
					};
					const anyFail = truths.some((t) => !t);
					expect(evaluate(p, {})).toBe(anyFail ? "DENY" : "ALLOW");
				},
			),
		);
	});

	it("not(not(rule)) ≡ rule (Not is an involution)", () => {
		fc.assert(
			fc.property(fc.boolean(), (t) => {
				const leaf: import("./policy").Rule = t
					? {
							kind: "eq",
							left: { kind: "lit", value: 1 },
							right: { kind: "lit", value: 1 },
						}
					: {
							kind: "eq",
							left: { kind: "lit", value: 1 },
							right: { kind: "lit", value: 0 },
						};
				expect(
					holds({ kind: "not", child: { kind: "not", child: leaf } }, {}),
				).toBe(holds(leaf, {}));
			}),
		);
	});

	it("evaluate is deterministic and total: same ctx ⇒ same Decision", () => {
		fc.assert(
			fc.property(fc.integer({ min: 0, max: 5 }), (n) => {
				const ctx = {
					auth: { user: { id: "u1" } },
					cart: {
						userId: "u1",
						items: Array.from({ length: n }, (_, i) => ({ id: i })),
					},
				};
				const a = evaluate(CAN_PLACE_ORDER, ctx);
				const b = evaluate(CAN_PLACE_ORDER, ctx);
				expect(a).toBe(b);
				expect(a).toBe(n > 0 ? "ALLOW" : "DENY");
			}),
		);
	});
});
