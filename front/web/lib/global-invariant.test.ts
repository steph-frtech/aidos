import fc from "fast-check";
import { describe, expect, it } from "vitest";
import {
	AUTHORITIES,
	type Authority,
	admit,
	BLAST_RADII,
	type BlastRadius,
	CODE_INSUFFICIENT_APPROVAL,
	type GlobalInvariant,
	minAuthorityForRadius,
	redWave,
	SCOPES,
	type Scope,
	validate,
} from "./global-invariant";
import {
	PII_FORGETTABLE_FEDERATION,
	VIOLATED_CELL,
} from "./global-invariant-data";

/**
 * Reproducibility mirror (fast-check) for the GlobalInvariant decider projection — the front
 * twin of back/kernel/globalinvariant's rapid property mirror. reflects=lib/global-invariant,
 * test_kind=property, cert_language=fast-check, authority=above (the human red of KRD §49.1).
 * It pins that the TS projection decides EXACTLY as the Go decider: the cross-cell red wave
 * reddens every spanned cell, Admit is monotone in radius (global never admitted without
 * architecture_owner), totality + determinism, and the enum/cardinality guards.
 */

const authorityRank: Record<Authority, number> = {
	cell_owner: 0,
	both_contract_owners: 1,
	architecture_owner: 2,
};
const CELL_POOL = [
	"checkout",
	"profile",
	"billing",
	"order",
	"payment",
	"shipping",
];

function validInvariant(): fc.Arbitrary<GlobalInvariant> {
	return fc
		.record({
			scope: fc.constantFrom<Scope>(...SCOPES),
			blastRadius: fc.constantFrom<BlastRadius>(...BLAST_RADII),
		})
		.chain(({ scope, blastRadius }) => {
			const min = scope === "local_cell" ? 1 : 2;
			const minTier = minAuthorityForRadius(blastRadius);
			const wider = AUTHORITIES.filter(
				(a) => authorityRank[a] >= authorityRank[minTier],
			);
			return fc.record({
				name: fc.constant("inv"),
				scope: fc.constant(scope),
				cells: fc.uniqueArray(fc.constantFrom(...CELL_POOL), {
					minLength: min,
					maxLength: CELL_POOL.length,
				}),
				predicate: fc.constant("p"),
				blastRadius: fc.constant(blastRadius),
				approvalRequired: fc.constantFrom(...wider),
			});
		});
}

describe("GlobalInvariant — the verbatim federation fixture", () => {
	it("validates the pii-forgettable-federation invariant", () => {
		expect(validate(PII_FORGETTABLE_FEDERATION)).toBe("");
	});

	it("reddens EVERY cell in the federation reach on a billing violation (the done case)", () => {
		const wave = redWave(PII_FORGETTABLE_FEDERATION, VIOLATED_CELL);
		expect(new Set(wave)).toEqual(new Set(["checkout", "profile", "billing"]));
		expect(wave.length).toBeGreaterThan(1); // not limited to the violator
	});

	it("blocks a global blast_radius approved only by a cell_owner (the approval done case)", () => {
		const d = admit(PII_FORGETTABLE_FEDERATION, "cell_owner");
		expect(d.decision).toBe("blocked");
		expect(d.blockReason?.code).toBe(CODE_INSUFFICIENT_APPROVAL);
		expect(d.blockReason?.howToFix).toContain("escalate_to_architecture_owner");
	});

	it("admits a global blast_radius approved by the architecture_owner", () => {
		expect(
			admit(PII_FORGETTABLE_FEDERATION, "architecture_owner").decision,
		).toBe("admitted");
	});

	it("rejects a federation_policy invariant naming a single cell", () => {
		expect(
			validate({ ...PII_FORGETTABLE_FEDERATION, cells: ["billing"] }),
		).not.toBe("");
	});
});

describe("GlobalInvariant — properties (∀)", () => {
	it("RedWave is total, deterministic, and never under-propagates", () => {
		fc.assert(
			fc.property(
				validInvariant(),
				fc.constantFrom(...CELL_POOL),
				(inv, violated) => {
					const a = redWave(inv, violated);
					const b = redWave(inv, violated);
					expect(a).toEqual(b);
					if (inv.scope === "local_cell") {
						expect(a.length).toBe(1);
					} else {
						for (const c of inv.cells) expect(a).toContain(c);
					}
				},
			),
		);
	});

	it("Admit is total, deterministic, and monotone in radius", () => {
		fc.assert(
			fc.property(
				validInvariant(),
				fc.constantFrom<Authority>(...AUTHORITIES),
				(inv, granted) => {
					const d = admit(inv, granted);
					expect(d).toEqual(admit(inv, granted));
					expect(["admitted", "blocked", "escalated"]).toContain(d.decision);
					const required = minAuthorityForRadius(inv.blastRadius);
					if (d.decision === "admitted")
						expect(authorityRank[granted]).toBeGreaterThanOrEqual(
							authorityRank[required],
						);
					if (inv.blastRadius === "global" && d.decision === "admitted")
						expect(granted).toBe("architecture_owner");
					if (d.decision === "blocked")
						expect(d.blockReason?.howToFix.length ?? 0).toBeGreaterThan(0);
				},
			),
		);
	});

	it("rejects out-of-enum scope / blast_radius / approval_required", () => {
		expect(
			validate({
				...PII_FORGETTABLE_FEDERATION,
				scope: "galaxy_policy" as Scope,
			}),
		).not.toBe("");
		expect(
			validate({
				...PII_FORGETTABLE_FEDERATION,
				blastRadius: "cosmic" as BlastRadius,
			}),
		).not.toBe("");
		expect(
			validate({
				...PII_FORGETTABLE_FEDERATION,
				approvalRequired: "god" as Authority,
			}),
		).not.toBe("");
	});
});
