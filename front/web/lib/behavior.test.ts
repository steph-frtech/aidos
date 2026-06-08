/**
 * S76/S67 — the behavior expander REPRODUCIBILITY mirror (TS twin). It pins that the TS `expand`
 * is BYTE-IDENTICAL to the Go behavior.Expand: the content addresses (expansionId) match fixed
 * golden hashes produced by the Go engine. If the TS twin ever diverges (a "second implementation"
 * creeping in), these golden assertions go red — the determinism gap is caught.
 *
 * It also pins determinism (same attachment → same expansion), idempotence (re-attaching to an
 * already-expanded shape emits nothing new), and the wall (wroteKernel always false).
 */

import fc from "fast-check";
import { describe, expect, it } from "vitest";
import {
	catalogue,
	expand,
	type Kind,
	pieceCount,
	sortedNames,
} from "./behavior";

// GOLDEN expansionIds produced by the Go engine (behavior.Expand on a fresh "Order"), the byte-
// identical reference. Regenerated only from Go — never hand-tuned (that would defeat the mirror).
const GOLDEN_EXPANSION_ID: Record<Kind, string> = {
	ownable: "5b504145ee692a189516b15366889239114b56cab9f274e3d696a27e327f76e7",
	"soft-deletable":
		"b398af5c1f8d5738684ab2cc71cb7700842b1cd2889e34a24c36e76927f8e064",
	auditable: "69c1d35a56fddf66c7cfd18462aa859fa51cd1a91201da2239ae3c7ab887c426",
};

describe("behavior.expand — byte-identical to Go (golden content addresses)", () => {
	for (const k of catalogue()) {
		it(`${k} expands to the Go golden expansionId on a fresh Order`, () => {
			const e = expand({ behavior: k, entity: "Order" });
			expect(e.expansionId).toBe(GOLDEN_EXPANSION_ID[k]);
			expect(e.wroteKernel).toBe(false);
		});
	}
});

describe("behavior.expand — §24.6 owner-scoping boilerplate (ownable)", () => {
	it("expands owner_id + owner→User + owner-scoping + 2 fixtures", () => {
		const e = expand({ behavior: "ownable", entity: "Order" });
		expect(e.attributes).toEqual([
			{ name: "owner_id", type: "string", required: true },
		]);
		expect(e.relations[0].target).toBe("User");
		expect(e.policies[0].name).toBe("owner-scoping");
		expect(e.fixtures).toHaveLength(2);
	});
});

describe("behavior.expand — invariants", () => {
	it("rejects an unknown behavior", () => {
		expect(() =>
			expand({ behavior: "telepathic" as Kind, entity: "Order" }),
		).toThrow();
	});
	it("rejects an entity-less attachment", () => {
		expect(() => expand({ behavior: "ownable", entity: "" })).toThrow();
	});

	it("is deterministic: same attachment → byte-identical expansion (∀)", () => {
		fc.assert(
			fc.property(
				fc.constantFrom(...catalogue()),
				fc.stringMatching(/^[A-Z][a-z]{0,8}$/),
				(behavior, entity) => {
					const a = { behavior, entity };
					expect(expand(a)).toEqual(expand(a));
				},
			),
		);
	});

	it("is idempotent: re-attaching to an already-expanded shape emits nothing (∀)", () => {
		fc.assert(
			fc.property(
				fc.constantFrom(...catalogue()),
				fc.stringMatching(/^[A-Z][a-z]{0,8}$/),
				(behavior, entity) => {
					const first = expand({ behavior, entity });
					const second = expand({
						behavior,
						entity,
						existing: {
							attributes: first.attributes.map((x) => x.name),
							relations: first.relations.map((x) => x.name),
							operations: first.operations.map((x) => x.name),
							policies: first.policies.map((x) => x.name),
							fixtures: first.fixtures.map((x) => x.name),
						},
					});
					expect(pieceCount(second)).toBe(0);
				},
			),
		);
	});

	it("writes no kernel truth (wroteKernel always false) (∀)", () => {
		fc.assert(
			fc.property(fc.constantFrom(...catalogue()), (behavior) => {
				expect(expand({ behavior, entity: "X" }).wroteKernel).toBe(false);
			}),
		);
	});

	it("sortedNames is stable + covers every piece", () => {
		const e = expand({ behavior: "ownable", entity: "Order" });
		expect(sortedNames(e)).toEqual([...sortedNames(e)].sort());
		expect(sortedNames(e)).toContain("attr:owner_id");
		expect(sortedNames(e)).toContain("pol:owner-scoping");
	});
});
