import fc from "fast-check";
import { describe, expect, it } from "vitest";
import {
	type AuthorityGraph,
	CODE_MISSING_AUTHORITY_APPROVAL,
	CODE_VETOED,
	decide,
	isKnownTruthKind,
	type Role,
	TRUTH_KINDS,
	validate,
} from "./authority";
import { CHECKOUT_REGULATORY } from "./authority-data";

/**
 * Reproducibility mirror (fast-check) for the AuthorityGraph decider projection — the front
 * twin of back/kernel/authority's rapid property mirror. reflects=lib/authority,
 * test_kind=property, cert_language=fast-check, authority=above (the human red of KRD
 * §13.8). It pins that the TS projection decides EXACTLY as the Go decider:
 *   - the four admission cases (no-approval ⇒ blocked/MISSING_AUTHORITY_APPROVAL,
 *     full ⇒ admitted, vetoed ⇒ blocked/VETOED, partial ⇒ escalated),
 *   - veto dominates, no-admission-without-authority, totality, determinism,
 *   - an out-of-§13.4-enum truth_kind ⇒ validate errors.
 */

const POOL: Role[] = [
	"legal",
	"product_owner",
	"security",
	"architecture_board",
	"design",
	"ops",
	"finance",
];
const arbRole = fc.constantFrom(...POOL);
const arbRoles = fc.array(arbRole, { maxLength: 4 });

const arbGraph: fc.Arbitrary<AuthorityGraph> = fc
	.record({
		approvers: fc.array(arbRole, { minLength: 1, maxLength: 3 }),
		veto: arbRoles,
		escalation: arbRoles,
		truthKind: fc.constantFrom(...TRUTH_KINDS),
	})
	.map((g) => ({
		domain: "checkout",
		truthKind: g.truthKind,
		approvers: [...new Set(g.approvers)],
		// drop any veto role that is also an approver (validate forbids the overlap)
		veto: g.veto.filter((v) => !g.approvers.includes(v)),
		escalation: g.escalation,
	}));

describe("AuthorityGraph decider — the four fixture rows (KRD §13.8)", () => {
	const truth = { domain: "checkout", truthKind: "regulatory" };

	it("row 1 — no approval ⇒ blocked / MISSING_AUTHORITY_APPROVAL with obtain_legal_approval", () => {
		const d = decide(CHECKOUT_REGULATORY, truth, []);
		expect(d.decision).toBe("blocked");
		expect(d.blockReason?.code).toBe(CODE_MISSING_AUTHORITY_APPROVAL);
		expect(d.blockReason?.howToFix).toContain("obtain_legal_approval");
	});

	it("row 2 — full approval ⇒ admitted", () => {
		const d = decide(CHECKOUT_REGULATORY, truth, ["legal", "product_owner"]);
		expect(d.decision).toBe("admitted");
		expect(d.blockReason).toBeUndefined();
	});

	it("row 3 — a granted veto ⇒ blocked / VETOED regardless of approvers", () => {
		const d = decide(CHECKOUT_REGULATORY, truth, [
			"legal",
			"product_owner",
			"security",
		]);
		expect(d.decision).toBe("blocked");
		expect(d.blockReason?.code).toBe(CODE_VETOED);
	});

	it("row 4 — partial approval ⇒ escalated to architecture_board", () => {
		const d = decide(CHECKOUT_REGULATORY, truth, ["product_owner"]);
		expect(d.decision).toBe("escalated");
		expect(d.escalatedTo).toContain("architecture_board");
	});
});

describe("AuthorityGraph decider — invariants (∀)", () => {
	it("is total — always one of admitted | blocked | escalated", () => {
		fc.assert(
			fc.property(arbGraph, arbRoles, (g, granted) => {
				const d = decide(
					g,
					{ domain: g.domain, truthKind: g.truthKind },
					granted,
				);
				expect(["admitted", "blocked", "escalated"]).toContain(d.decision);
			}),
		);
	});

	it("is deterministic — same input ⇒ same decision", () => {
		fc.assert(
			fc.property(arbGraph, arbRoles, (g, granted) => {
				const a = decide(
					g,
					{ domain: g.domain, truthKind: g.truthKind },
					granted,
				);
				const b = decide(
					g,
					{ domain: g.domain, truthKind: g.truthKind },
					granted,
				);
				expect(a.decision).toBe(b.decision);
			}),
		);
	});

	it("no admission without authority — a missing required approver is never admitted", () => {
		fc.assert(
			fc.property(arbGraph, arbRoles, (g, granted) => {
				const missing = g.approvers.some((a) => !granted.includes(a));
				if (missing) {
					const d = decide(
						g,
						{ domain: g.domain, truthKind: g.truthKind },
						granted,
					);
					expect(d.decision).not.toBe("admitted");
				}
			}),
		);
	});

	it("veto dominates — any granted veto role ⇒ blocked / VETOED", () => {
		fc.assert(
			fc.property(arbGraph, (g) => {
				if (g.veto.length === 0) return;
				const granted = [...g.approvers, g.veto[0]];
				const d = decide(
					g,
					{ domain: g.domain, truthKind: g.truthKind },
					granted,
				);
				expect(d.decision).toBe("blocked");
				expect(d.blockReason?.code).toBe(CODE_VETOED);
			}),
		);
	});

	it("validate rejects an out-of-§13.4-enum truth_kind", () => {
		fc.assert(
			fc.property(
				fc.string().filter((s) => !isKnownTruthKind(s)),
				(bad) => {
					const g: AuthorityGraph = {
						domain: "checkout",
						truthKind: bad,
						approvers: ["legal"],
						veto: [],
						escalation: [],
					};
					expect(validate(g)).not.toBe("");
				},
			),
		);
	});

	it("validate rejects an empty approvers list and an approver/veto overlap", () => {
		expect(
			validate({
				domain: "checkout",
				truthKind: "regulatory",
				approvers: [],
				veto: [],
				escalation: [],
			}),
		).not.toBe("");
		expect(
			validate({
				domain: "checkout",
				truthKind: "regulatory",
				approvers: ["legal"],
				veto: ["legal"],
				escalation: [],
			}),
		).not.toBe("");
	});
});
