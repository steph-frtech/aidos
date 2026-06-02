import fc from "fast-check";
import { describe, expect, it } from "vitest";
import {
	CODE_ACTIVE_TRUTH_WITHOUT_SCOPE,
	ENVIRONMENTS,
	isEmpty,
	isGlobal,
	LIFECYCLE_STATUSES,
	REGION_GLOBAL,
	REGIONS,
	rejectionCode,
	type ScopeRecord,
	TARGETS,
	type TruthScope,
	USER_SEGMENTS,
	verdict,
} from "./scope";

/**
 * Reproducibility mirror (fast-check) for the TruthScope guard projection — the front
 * twin of back/kernel/scope's rapid property mirror. reflects=lib/scope,
 * test_kind=property, cert_language=fast-check, authority=above (the human red of KRD
 * §13.7). It pins that the TS projection routes EXACTLY as the Go guard:
 *   - the load-bearing reject rule (active ∧ empty ∧ ¬global ⇒ rejected),
 *   - the explicit-global pass, the present-scope pass, the non-active exemption,
 *   - isGlobal ⇔ region "*", the §13.7 enum cardinalities, and determinism.
 */

// Arbitraries spanning the §13.7 domains + the absent/arbitrary boundary.
const arbRegion = fc.oneof(
	fc.constantFrom(...REGIONS),
	fc.constant(""),
	fc.string(),
);
const arbStatus = fc.oneof(
	fc.constantFrom(...LIFECYCLE_STATUSES),
	fc.constant(""),
	fc.string(),
);

const arbScope: fc.Arbitrary<TruthScope> = fc.oneof(
	fc.constant<TruthScope>({}), // empty
	fc.constant<TruthScope>({ region: REGION_GLOBAL }), // explicit global
	fc.record<TruthScope>({
		region: fc.constantFrom("FR", "EU", "US"),
		tenant: fc.string(),
		environment: fc.constantFrom(...ENVIRONMENTS),
	}),
	fc.record<TruthScope>({ region: arbRegion }),
);

const arbRecord: fc.Arbitrary<ScopeRecord> = fc.record({
	status: arbStatus,
	scope: arbScope,
});

describe("TruthScope guard (lib/scope) — KRD §13.7", () => {
	it("THE load-bearing rule: an active, empty, non-global record is rejected", () => {
		fc.assert(
			fc.property(arbRecord, (rec) => {
				const scopeless = isEmpty(rec.scope) && !isGlobal(rec.scope);
				if (rec.status === "active" && scopeless) {
					expect(verdict(rec)).toBe("rejected");
					expect(rejectionCode(rec)).toBe(CODE_ACTIVE_TRUTH_WITHOUT_SCOPE);
				}
			}),
		);
	});

	it("explicit global ('*') is the only universal: it passes", () => {
		fc.assert(
			fc.property(fc.constantFrom(...LIFECYCLE_STATUSES), (status) => {
				const rec: ScopeRecord = { status, scope: { region: REGION_GLOBAL } };
				// active ⇒ "global"; non-active ⇒ "accepted" (exempt). Never rejected.
				expect(verdict(rec)).not.toBe("rejected");
				expect(isGlobal(rec.scope)).toBe(true);
			}),
		);
	});

	it("an active truth with a present non-empty scope passes", () => {
		fc.assert(
			fc.property(fc.constantFrom("FR", "EU", "US"), (region) => {
				const rec: ScopeRecord = { status: "active", scope: { region } };
				expect(isEmpty(rec.scope)).toBe(false);
				expect(verdict(rec)).toBe("accepted");
			}),
		);
	});

	it("the rule binds ACTIVE truths only — any other status is exempt", () => {
		fc.assert(
			fc.property(arbRecord, (rec) => {
				if (rec.status !== "active") {
					expect(verdict(rec)).toBe("accepted");
					expect(rejectionCode(rec)).toBe("");
				}
			}),
		);
	});

	it("isGlobal ⇔ region === '*' (the empty scope is NOT global)", () => {
		fc.assert(
			fc.property(arbScope, (s) => {
				expect(isGlobal(s)).toBe(s.region === REGION_GLOBAL);
			}),
		);
		expect(isGlobal({})).toBe(false);
	});

	it("verdict is deterministic (same record ⇒ same verdict)", () => {
		fc.assert(
			fc.property(arbRecord, (rec) => {
				expect(verdict(rec)).toBe(verdict(rec));
			}),
		);
	});

	it("the §13.7 / §44.2 enums have exactly the declared cardinalities", () => {
		expect(REGIONS.length).toBe(4); // FR|EU|US|*
		expect(TARGETS.length).toBe(5); // web|mobile|voice|xr|iot
		expect(USER_SEGMENTS.length).toBe(3); // premium|standard|guest
		expect(ENVIRONMENTS.length).toBe(3); // prod|staging|dev
		expect(LIFECYCLE_STATUSES.length).toBe(4); // active|deprecated|shadowed|removed
	});
});
