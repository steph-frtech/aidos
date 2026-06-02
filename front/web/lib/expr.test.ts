import fc from "fast-check";
import { describe, expect, it } from "vitest";
import {
	CATALOGUE_NAMES,
	type Expr,
	ExprRejected,
	evaluate,
	flatten,
	isCatalogueFunc,
	isNodeKind,
	NODE_KINDS,
	parse,
	rootsOf,
	sampleById,
	sampleResult,
} from "./expr";

/**
 * Reproducibility mirror (Vitest + fast-check): reflects=lib/expr,
 * test_kind=property+fixture, liveness=live, authority=below.
 *
 * Pins the /expr projection against the Go invariants (back/kernel/expr):
 *   - the node-kind set and the CLOSED catalogue match the Go registries;
 *   - the sample verdicts match the fixture mirror ($.cart.items.length > 0 ⇒
 *     true for a non-empty cart, false for an empty one; lowercase composes);
 *   - an unknown function is REJECTED at parse, never evaluated;
 *   - evaluate is deterministic (same AST + env ⇒ same value).
 * It is a MEANS-test toward the human red, below the line — not a new truth.
 */

describe("Expr DSL — closed grammar (mirrors back/kernel/expr)", () => {
	it("pins the five node kinds in canonical order", () => {
		expect(NODE_KINDS).toEqual(["lit", "ref", "call", "obj", "arr"]);
	});

	it("pins the closed catalogue (field-for-field with catalogue.go)", () => {
		expect(CATALOGUE_NAMES).toEqual([
			"lowercase",
			"concat",
			"now",
			"uuid",
			"randomToken",
			">",
			"&&",
			"!",
			"length",
		]);
	});

	it("rejects a non-catalogue function at parse, never evaluates it", () => {
		const exec = {
			kind: "call",
			fn: "exec",
			args: [{ kind: "lit", value: "rm -rf /" }],
		};
		expect(() => parse(exec)).toThrow(ExprRejected);
	});

	it("rejects an unknown node kind", () => {
		expect(() => parse({ kind: "spawn", value: 1 })).toThrow(ExprRejected);
	});
});

describe("Expr DSL — visible_when verdicts (mirrors the fixture mirror)", () => {
	it("visible_when is TRUE for a non-empty cart", () => {
		const s = sampleById("visible_when-nonempty");
		expect(evaluate(s.ast, s.env)).toBe(true);
		expect(sampleResult(s)).toBe("true");
	});

	it("visible_when is FALSE for an empty cart", () => {
		const s = sampleById("visible_when-empty");
		expect(evaluate(s.ast, s.env)).toBe(false);
		expect(sampleResult(s)).toBe("false");
	});

	it('a function call composes — lowercase($.auth.user.name) == "ada"', () => {
		const s = sampleById("lowercase-compose");
		expect(evaluate(s.ast, s.env)).toBe("ada");
	});

	it("flatten exposes the typed node tree (call > ref/lit)", () => {
		const s = sampleById("visible_when-nonempty");
		const flat = flatten(s.ast);
		expect(flat[0]).toMatchObject({ depth: 0, kind: "call", label: ">" });
		expect(
			flat.some((n) => n.kind === "ref" && n.label === "$.cart.items.length"),
		).toBe(true);
		expect(flat.some((n) => n.kind === "lit")).toBe(true);
	});

	it("rootsOf lists the resolved $-roots", () => {
		const s = sampleById("lowercase-compose");
		expect(rootsOf(s.ast)).toEqual(["$.auth.user.name"]);
	});
});

describe("Expr DSL — invariants (∀)", () => {
	it("evaluate is deterministic: same AST + env ⇒ same value", () => {
		fc.assert(
			fc.property(fc.integer({ min: 0, max: 5 }), (n) => {
				const ast: Expr = {
					kind: "call",
					fn: ">",
					args: [
						{ kind: "ref", path: "$.cart.items.length" },
						{ kind: "lit", value: 0 },
					],
				};
				const env = {
					cart: { items: Array.from({ length: n }, (_, i) => ({ id: i })) },
				};
				const a = evaluate(ast, env);
				const b = evaluate(ast, env);
				expect(a).toBe(b);
				expect(a).toBe(n > 0);
			}),
		);
	});

	it("a random non-catalogue function name is always rejected (no free-code escape)", () => {
		fc.assert(
			fc.property(fc.stringMatching(/^[a-z]{2,8}$/), (name) => {
				fc.pre(!isCatalogueFunc(name));
				expect(() => parse({ kind: "call", fn: name, args: [] })).toThrow(
					ExprRejected,
				);
			}),
		);
	});

	it("a random non-node kind is always rejected", () => {
		fc.assert(
			fc.property(fc.stringMatching(/^[a-z]{2,8}$/), (k) => {
				fc.pre(!isNodeKind(k));
				expect(() => parse({ kind: k })).toThrow(ExprRejected);
			}),
		);
	});
});
