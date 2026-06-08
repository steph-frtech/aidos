/**
 * Reproducibility mirror for the entity-relation twin (S71) — the TS side of the
 * S71 property mirror (back/kernel/entities/ref/ref_property_test.go), pinned with
 * Vitest + fast-check. Same input ⇒ same output (determinism); a relation round-trips
 * as a content-addressed AST; the cardinality/semantic sets are closed; a relation to a
 * nonexistent entity is refused UNKNOWN_RELATION_TARGET (never guessed). The Go output
 * is AUTHORITATIVE — these tests assert the twin reproduces it byte-for-byte.
 */

import fc from "fast-check";
import { describe, expect, it } from "vitest";
import {
	address,
	blockUnknownTarget,
	CARDINALITIES,
	type Cardinality,
	isBlocked,
	relationBody,
	relationId,
	resolve,
	SEMANTICS,
	type Semantic,
} from "./entity-relation";

const arbRelation = fc.record({
	name: fc.stringMatching(/^[a-z][a-z0-9_]{0,7}$/),
	target: fc.stringMatching(/^[A-Z][A-Za-z0-9]{0,7}$/),
	cardinality: fc.constantFrom(...CARDINALITIES) as fc.Arbitrary<Cardinality>,
	semantic: fc.constantFrom(...SEMANTICS) as fc.Arbitrary<Semantic>,
	required: fc.boolean(),
});

describe("entity-relation twin (S71)", () => {
	it("byte-equal to the Go ref.Body + ref.ID (the cross-language anchor)", () => {
		// the exact Go canonical body + hash dumped from ref.Body/ref.ID.
		const r = {
			name: "customer",
			target: "Customer",
			cardinality: "1-N" as const,
			semantic: "fk" as const,
			required: true,
		};
		expect(relationBody(r)).toBe(
			'{"cardinality":"1-N","name":"customer","required":true,"semantic":"fk","target":"Customer"}',
		);
		expect(relationId(r)).toBe(
			"a853f1ccd185d5bf17edc45cd1a7665e83f0a2f144844eba9378dd4e02d5dfee",
		);
	});

	it("a relation round-trips as a content-addressed AST (determinism)", () => {
		fc.assert(
			fc.property(arbRelation, (r) => {
				expect(relationId(r)).toBe(relationId(r));
				// retarget ⇒ a different id (the target is part of identity).
				const alt = { ...r, target: `${r.target}X` };
				expect(relationId(alt)).not.toBe(relationId(r));
			}),
		);
	});

	it("a declared target resolves; the kinds are closed", () => {
		fc.assert(
			fc.property(arbRelation, (r) => {
				expect(resolve(r, [r.target])).toBeNull();
				const bad = { ...r, cardinality: "7-7" as Cardinality };
				expect(resolve(bad, [r.target])).not.toBeNull();
			}),
		);
	});

	it("a relation to a nonexistent entity is refused UNKNOWN_RELATION_TARGET, never guessed", () => {
		fc.assert(
			fc.property(arbRelation, (r) => {
				const out = address(r, []); // declared set EXCLUDES the target
				expect(isBlocked(out)).toBe(true);
				if (isBlocked(out)) {
					expect(out.explanation).toContain("UNKNOWN_RELATION_TARGET");
					expect(out.how_to_fix.length).toBeGreaterThan(0);
				}
			}),
		);
	});

	it("an out-of-set kind is refused UNKNOWN_RELATION_KIND", () => {
		const br = blockUnknownTarget("unknown cardinality: 3-3");
		expect(br.explanation).toContain("UNKNOWN_RELATION_KIND");
	});

	it("every cardinality×semantic is addressable with a distinct hash", () => {
		const seen = new Set<string>();
		for (const c of CARDINALITIES) {
			for (const s of SEMANTICS) {
				const out = address(
					{ name: "r", target: "Customer", cardinality: c, semantic: s },
					["Customer"],
				);
				expect(isBlocked(out)).toBe(false);
				if (!isBlocked(out)) seen.add(out);
			}
		}
		expect(seen.size).toBe(CARDINALITIES.length * SEMANTICS.length);
	});
});
