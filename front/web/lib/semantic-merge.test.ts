/**
 * Reproducibility mirror (∀) for the semantic-merge projection (lib/semantic-merge.ts), the TS twin
 * of back/archive/merge's rapid property test. fast-check is the frozen front invariant slot
 * (ADR 0003). It pins KRD §122/§130: determinism, totality (status ∈ {clean, conflict, unresolvable}),
 * any-red⇒conflict, all-green⇒clean, identity⇒clean-no-op, text-cleanliness-never-overrides-red,
 * unresolvable⇒no-fabricated-clean, and the three done criteria on the canonical examples — so the
 * /semantic-merge screen decides EXACTLY as the Go MergeSemantic / the /merge-semantic gesture.
 */

import fc from "fast-check";
import { describe, expect, it } from "vitest";
import {
	type Base,
	type Branch,
	type MergeStatus,
	mergeSemantic,
	type SensorStatus,
} from "./semantic-merge";
import { EXAMPLES } from "./semantic-merge-data";

const ANCESTOR = "base-v0";
const VALID: ReadonlySet<MergeStatus> = new Set<MergeStatus>([
	"clean",
	"conflict",
	"unresolvable",
]);

const idArb = fc.constantFrom(
	"refund",
	"cart.own_mirror",
	"pay",
	"amount",
	"promo",
	"help",
);
const sensorsArb: fc.Arbitrary<SensorStatus[]> = fc.array(
	fc.record({ id: idArb, pass: fc.boolean() }),
	{ maxLength: 4 },
);
const cutArb: fc.Arbitrary<Record<string, string>> = fc.dictionary(
	fc.constantFrom("refund", "cart", "view", "promo-banner", "help-link"),
	fc.constantFrom("v1", "v2", "v2-EU", "v2-US"),
	{ maxKeys: 3 },
);

function mappable(): fc.Arbitrary<{ base: Base; left: Branch; right: Branch }> {
	return fc.record({
		base: fc.record({
			id: fc.constant(ANCESTOR),
			cut: cutArb,
			sensors: sensorsArb,
		}),
		left: fc.record({
			ancestor: fc.constant(ANCESTOR),
			deltas: cutArb,
			addedSensors: sensorsArb,
		}),
		right: fc.record({
			ancestor: fc.constant(ANCESTOR),
			deltas: cutArb,
			addedSensors: sensorsArb,
		}),
	});
}

// anyRed: the union of base+left+right verdicts (last-writer per id) has a red one — the oracle.
function anyRed(base: Base, left: Branch, right: Branch): boolean {
	const last = new Map<string, boolean>();
	for (const s of base.sensors) last.set(s.id, s.pass);
	for (const s of left.addedSensors) last.set(s.id, s.pass);
	for (const s of right.addedSensors) last.set(s.id, s.pass);
	return [...last.values()].some((p) => !p);
}

describe("mergeSemantic — reproducibility mirror (KRD §122/§130)", () => {
	it("is deterministic and total (status in the closed set)", () => {
		fc.assert(
			fc.property(mappable(), ({ base, left, right }) => {
				const a = mergeSemantic(base, left, right);
				const b = mergeSemantic(base, left, right);
				expect(a).toEqual(b);
				expect(VALID.has(a.status)).toBe(true);
			}),
		);
	});

	it("the mirror decides: any red ⇒ conflict (text-cleanliness never overrides), all green ⇒ clean", () => {
		fc.assert(
			fc.property(mappable(), ({ base, left, right }) => {
				const got = mergeSemantic(base, left, right);
				expect(got.status).not.toBe("unresolvable"); // mappable
				if (anyRed(base, left, right)) {
					expect(got.status).toBe("conflict");
					expect(got.requiresAuthority).toBe(true);
					expect(got.conflictingMirrors.length).toBeGreaterThan(0);
				} else {
					expect(got.status).toBe("clean");
					expect(got.conflictingMirrors).toEqual([]);
					expect(got.requiresAuthority).toBe(false);
				}
				expect(got.mergedCutHash).not.toBe("");
			}),
		);
	});

	it("identity ⇒ clean no-op (a green base merged with itself)", () => {
		fc.assert(
			fc.property(cutArb, (cut) => {
				const base: Base = {
					id: ANCESTOR,
					cut,
					sensors: [{ id: "refund", pass: true }],
				};
				const self: Branch = {
					ancestor: ANCESTOR,
					deltas: {},
					addedSensors: [],
				};
				const got = mergeSemantic(base, self, self);
				expect(got.status).toBe("clean");
				expect(got.conflictingMirrors).toEqual([]);
			}),
		);
	});

	it("no common ancestor ⇒ unresolvable ∧ OpenQuestion ∧ no fabricated clean / hash", () => {
		fc.assert(
			fc.property(
				fc.constantFrom("v0", "base-v0"),
				fc.constantFrom("a", "b", ""),
				fc.constantFrom("a", "b", ""),
				(baseId, la0, ra) => {
					const la =
						(la0 as string) === baseId && (ra as string) === baseId ? "a" : la0;
					const got = mergeSemantic(
						{ id: baseId, cut: {}, sensors: [] },
						{ ancestor: la, deltas: {}, addedSensors: [] },
						{ ancestor: ra, deltas: {}, addedSensors: [] },
					);
					expect(got.status).toBe("unresolvable");
					expect(got.openQuestion ?? "").not.toBe("");
					expect(got.mergedCutHash).toBe("");
				},
			),
		);
	});

	it("never throws (incl. empty inputs)", () => {
		expect(() =>
			mergeSemantic(
				{ id: "", cut: {}, sensors: [] },
				{ ancestor: "", deltas: {}, addedSensors: [] },
				{ ancestor: "", deltas: {}, addedSensors: [] },
			),
		).not.toThrow();
	});

	// The three done criteria on the canonical examples — the screen decides exactly as the fixture.
	it("done criteria: refund ⇒ conflict (clean text, red mirror, blocked), cart ⇒ conflict, view ⇒ clean", () => {
		const byId = Object.fromEntries(EXAMPLES.map((e) => [e.id, e]));
		const refund = mergeSemantic(
			byId.refund.base,
			byId.refund.left,
			byId.refund.right,
		);
		expect(refund.status).toBe("conflict");
		expect(refund.conflictingMirrors).toContain("refund");
		expect(refund.requiresAuthority).toBe(true);

		const cart = mergeSemantic(byId.cart.base, byId.cart.left, byId.cart.right);
		expect(cart.status).toBe("conflict");
		expect(cart.conflictingMirrors).toContain("cart.own_mirror");

		const view = mergeSemantic(byId.view.base, byId.view.left, byId.view.right);
		expect(view.status).toBe("clean");
		expect(view.conflictingMirrors).toEqual([]);
	});
});
