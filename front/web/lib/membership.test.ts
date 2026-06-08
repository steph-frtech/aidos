import fc from "fast-check";
import { describe, expect, it } from "vitest";
import {
	authorize,
	canAdminister,
	newMembership,
	type OpKind,
	ROLES,
	type Role,
} from "./membership";

/**
 * lib/membership.test.ts — the S62 front INVARIANT mirror (fast-check) + the
 * determinism-first reproducibility property, the TS twin of
 * back/runtime/membership/membership_property_test.go. Same input ⇒ same output.
 */

describe("membership authorize — done-criteria", () => {
	it("a NON-MEMBER (no row) is refused NOT_A_MEMBER for every op", () => {
		for (const op of ["read", "mutate", "administer"] as OpKind[]) {
			const d = authorize(null, "proj-alpha", op);
			expect(d.verdict).toBe("deny");
			expect(d.blockReason?.code).toBe("NOT_A_MEMBER");
			expect(d.blockReason?.howToFix.length).toBeGreaterThan(0);
		}
	});

	it("a member of another project is a NON-MEMBER here", () => {
		const m = newMembership("bob", "proj-beta", "owner");
		const d = authorize(m, "proj-alpha", "read");
		expect(d.verdict).toBe("deny");
		expect(d.blockReason?.code).toBe("NOT_A_MEMBER");
	});

	it("a viewer reads but may NOT mutate (ROLE_FORBIDDEN)", () => {
		const v = newMembership("vic", "proj-alpha", "viewer");
		expect(authorize(v, "proj-alpha", "read").verdict).toBe("allow");
		const d = authorize(v, "proj-alpha", "mutate");
		expect(d.verdict).toBe("deny");
		expect(d.blockReason?.code).toBe("ROLE_FORBIDDEN");
		expect(authorize(v, "proj-alpha", "administer").verdict).toBe("deny");
	});

	it("an editor mutates but may NOT administer; an owner administers", () => {
		const ed = newMembership("ed", "proj-alpha", "editor");
		expect(authorize(ed, "proj-alpha", "mutate").verdict).toBe("allow");
		expect(authorize(ed, "proj-alpha", "administer").verdict).toBe("deny");
		expect(canAdminister(ed, "proj-alpha")).toBe(false);

		const oz = newMembership("oz", "proj-alpha", "owner");
		for (const op of ["read", "mutate", "administer"] as OpKind[]) {
			expect(authorize(oz, "proj-alpha", op).verdict).toBe("allow");
		}
		expect(canAdminister(oz, "proj-alpha")).toBe(true);
	});
});

describe("membership — role gradient ∀", () => {
	it("a viewer is NEVER allowed to mutate or administer", () => {
		fc.assert(
			fc.property(
				fc.constantFrom("mutate", "administer"),
				fc.string({ minLength: 1, maxLength: 8 }),
				(op, ident) => {
					const v = newMembership(ident.trim() || "x", "p", "viewer");
					return authorize(v, "p", op as OpKind).verdict === "deny";
				},
			),
		);
	});

	it("an owner is ALWAYS allowed every op", () => {
		fc.assert(
			fc.property(
				fc.constantFrom("read", "mutate", "administer"),
				fc.string({ minLength: 1, maxLength: 8 }),
				(op, ident) => {
					const o = newMembership(ident.trim() || "x", "p", "owner");
					return authorize(o, "p", op as OpKind).verdict === "allow";
				},
			),
		);
	});

	it("membership is per-project: a member of A is a NON-member of B", () => {
		fc.assert(
			fc.property(
				fc.constantFrom(...(ROLES as Role[])),
				fc.constantFrom("read", "mutate", "administer"),
				(role, op) => {
					const m = newMembership("u", "project-A", role);
					const d = authorize(m, "project-B", op as OpKind);
					return d.verdict === "deny" && d.blockReason?.code === "NOT_A_MEMBER";
				},
			),
		);
	});
});

describe("membership — determinism-first reproducibility", () => {
	it("newMembership is content-addressed & idempotent (same id)", () => {
		fc.assert(
			fc.property(
				fc.string({ minLength: 1, maxLength: 8 }),
				fc.string({ minLength: 1, maxLength: 8 }),
				fc.constantFrom(...(ROLES as Role[])),
				(rawIdent, rawProj, role) => {
					const ident = rawIdent.trim() || "x";
					const proj = rawProj.trim() || "p";
					const a = newMembership(ident, proj, role);
					const b = newMembership(ident, proj, role);
					return a.id === b.id && /^[0-9a-f]{64}$/.test(a.id);
				},
			),
		);
	});
});
