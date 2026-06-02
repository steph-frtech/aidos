/**
 * Reproducibility mirror (∀) for the ChangeSet projection (lib/changeset.ts), the TS twin of
 * back/archive/changeset's rapid property test. fast-check is the frozen front invariant slot
 * (ADR 0003). It pins KRD §44/§98: the closed status set (no FAILED), APPLIED immutability, the
 * completeness-gated apply, revert∘revert ≡ identity (delta-wise), and the canonical lifecycle
 * (the done criteria rendered by /changeset).
 */

import fc from "fast-check";
import { describe, expect, it } from "vitest";
import {
	apply,
	type ChangeSet,
	edit,
	revert,
	STATUSES,
	type Status,
	specHasMirror,
	stampReverted,
} from "./changeset";
import {
	ADD_ORDER_DISCOUNT,
	EXAMPLE_APPLIED_AT,
	INVERSE_ID,
	SPEC_WITHOUT_MIRROR,
} from "./changeset-data";

const deltaArb = fc.option(
	fc.record({
		kind: fc.constantFrom("add" as const, "remove" as const, "refine" as const),
		target: fc.string({ minLength: 1, maxLength: 12 }),
	}),
	{ nil: null },
);

const draftArb: fc.Arbitrary<ChangeSet> = fc.record({
	id: fc.string({ minLength: 1, maxLength: 8 }),
	label: fc.string({ maxLength: 16 }),
	status: fc.constant<Status>("DRAFT"),
	parentPhase: fc.string({ maxLength: 8 }),
	specDelta: deltaArb,
	mirrorDelta: deltaArb,
	reverts: fc.constant(null),
	appliedAt: fc.constant(null),
});

describe("changeset — invariants (∀)", () => {
	it("reachable statuses are exactly {DRAFT,APPLIED,REVERTED} — never FAILED", () => {
		expect(STATUSES).toEqual(["DRAFT", "APPLIED", "REVERTED"]);
		expect((STATUSES as readonly string[]).includes("FAILED")).toBe(false);
		fc.assert(
			fc.property(draftArb, (cs) => {
				const { applied } = apply(cs, EXAMPLE_APPLIED_AT);
				expect((STATUSES as readonly Status[]).includes(applied.status)).toBe(
					true,
				);
			}),
		);
	});

	it("apply is gated on completeness (spec without mirror is blocked)", () => {
		fc.assert(
			fc.property(draftArb, (cs) => {
				const { applied, block } = apply(cs, EXAMPLE_APPLIED_AT);
				if (cs.specDelta !== null && cs.mirrorDelta === null) {
					expect(block?.code).toBe("INCOMPLETE_CHANGESET");
				} else {
					expect(block).toBeNull();
					expect(applied.status).toBe("APPLIED");
				}
			}),
		);
	});

	it("an APPLIED envelope is immutable (edit is always blocked)", () => {
		fc.assert(
			fc.property(draftArb, (cs) => {
				const { applied, block } = apply(cs, EXAMPLE_APPLIED_AT);
				if (block === null) {
					expect(edit(applied)?.code).toBe("APPLIED_IS_IMMUTABLE");
				}
			}),
		);
	});

	it("revert∘revert reconstructs the source's deltas (identity)", () => {
		fc.assert(
			fc.property(draftArb, (cs) => {
				const { applied, block } = apply(cs, EXAMPLE_APPLIED_AT);
				if (block !== null) return;
				const r1 = revert(applied, "inv-1");
				if (r1.inverse === null) return;
				const invApplied = apply(r1.inverse, EXAMPLE_APPLIED_AT);
				if (invApplied.block !== null) return;
				const r2 = revert(invApplied.applied, "inv-2");
				expect(r2.inverse?.specDelta).toEqual(applied.specDelta);
				expect(r2.inverse?.mirrorDelta).toEqual(applied.mirrorDelta);
			}),
		);
	});
});

describe("changeset — the canonical add-order-discount lifecycle (done criteria)", () => {
	it("open yields a DRAFT", () => {
		expect(ADD_ORDER_DISCOUNT.status).toBe("DRAFT");
		expect(ADD_ORDER_DISCOUNT.appliedAt).toBeNull();
	});

	it("apply of the complete envelope yields APPLIED with applied_at", () => {
		const { applied, block } = apply(ADD_ORDER_DISCOUNT, EXAMPLE_APPLIED_AT);
		expect(block).toBeNull();
		expect(applied.status).toBe("APPLIED");
		expect(applied.appliedAt).toBe(EXAMPLE_APPLIED_AT);
	});

	it("apply of a spec-without-mirror envelope is blocked INCOMPLETE_CHANGESET", () => {
		const { block } = apply(SPEC_WITHOUT_MIRROR, EXAMPLE_APPLIED_AT);
		expect(block?.code).toBe("INCOMPLETE_CHANGESET");
		expect(block?.howToFix).toContain("add_mirror_for_spec_delta");
		expect(specHasMirror(SPEC_WITHOUT_MIRROR)?.code).toBe(
			"INCOMPLETE_CHANGESET",
		);
	});

	it("editing an APPLIED envelope is blocked APPLIED_IS_IMMUTABLE (THE done case)", () => {
		const { applied } = apply(ADD_ORDER_DISCOUNT, EXAMPLE_APPLIED_AT);
		expect(edit(applied)?.code).toBe("APPLIED_IS_IMMUTABLE");
	});

	it("revert appends an inverse DRAFT, source stays APPLIED then stamps REVERTED (THE done case)", () => {
		const { applied } = apply(ADD_ORDER_DISCOUNT, EXAMPLE_APPLIED_AT);
		const { inverse, block } = revert(applied, INVERSE_ID);
		expect(block).toBeNull();
		expect(inverse?.status).toBe("DRAFT");
		expect(inverse?.reverts).toBe(applied.id);
		expect(inverse?.specDelta?.kind).toBe("remove"); // negation of add
		expect(inverse?.id).not.toBe(applied.id);
		// the source is unchanged by revert (still APPLIED, immutable).
		expect(applied.status).toBe("APPLIED");
		// applying the inverse stamps the source REVERTED — not deleted.
		expect(stampReverted(applied).status).toBe("REVERTED");
		expect(stampReverted(applied).id).toBe(applied.id);
	});

	it("a non-APPLIED envelope cannot be reverted", () => {
		expect(revert(ADD_ORDER_DISCOUNT, INVERSE_ID).block?.code).toBe(
			"NOT_APPLIED",
		);
	});
});
