/**
 * app-auth.test.ts — the S80 reproducibility mirror for the front twin (Vitest + fast-check). It pins
 * the done-criteria on the front plane: `app-auth` expands byte-identical auth entities+operations+
 * policies, and the EMITTED app's runtime gate refuses an insufficient role. The Go `ExpandAppAuth`
 * stays authoritative; this proves the TS twin reproduces it.
 */

import fc from "fast-check";
import { describe, expect, test } from "vitest";
import {
	AUTHZ_BAND,
	checkAccess,
	expandAppAuth,
	expansionId,
	pieceCount,
	ROLE_ORDER,
	type Role,
	sortedNames,
} from "./app-auth";

const targetArb = fc.stringMatching(/^[a-z][a-z0-9-]{0,15}$/);

describe("expandAppAuth — deterministic auth subsystem", () => {
	test("expands the full User/Role/Session + login/logout + authz band", () => {
		const sub = expandAppAuth("shop-app");
		const names = sortedNames(sub);
		for (const must of [
			"ent:User",
			"ent:Role",
			"ent:Session",
			"op:login",
			"op:logout",
			"pol:authz-login",
			"pol:authz-logout",
			"pol:authz-manageRoles",
		]) {
			expect(names).toContain(must);
		}
		expect(pieceCount(sub)).toBe(8);
		expect(sub.wroteKernel).toBe(false); // the wall
		expect(sub.expansionId).not.toBe("");
		for (const p of sub.policies) {
			expect(p.scope).toBe("OPERATION");
			expect(p.effect).toBe("DENY");
		}
	});

	test("byte-identical to the authoritative Go expansion for shop-app", () => {
		// the Go ExpandAppAuth("shop-app").ExpansionID (computed in CI) — the twin must match.
		expect(expandAppAuth("shop-app").expansionId).toBe(
			"2a2bcf9120cdd797d9aca93527f5a5606786bf64ebc0dd73059a54da452f94a4",
		);
	});

	test("empty target is a typed error (honesty)", () => {
		expect(() => expandAppAuth("")).toThrow();
	});

	test("same target ⇒ same expansionId (reproducibility)", () => {
		fc.assert(
			fc.property(targetArb, (target) => {
				const a = expandAppAuth(target);
				const b = expandAppAuth(target);
				expect(a.expansionId).toBe(b.expansionId);
				expect(expansionId(a)).toBe(a.expansionId);
				expect(sortedNames(a)).toEqual(sortedNames(b));
			}),
		);
	});
});

describe("checkAccess — the emitted app's runtime authz gate", () => {
	test("a viewer is DENIED the protected logout operation (the done-criterion)", () => {
		const d = checkAccess("viewer", "logout");
		expect(d.allowed).toBe(false);
		expect(d.required).toBe("editor");
	});

	test("an editor is ALLOWED logout but DENIED the admin-only manageRoles", () => {
		expect(checkAccess("editor", "logout").allowed).toBe(true);
		expect(checkAccess("editor", "manageRoles").allowed).toBe(false);
		expect(checkAccess("admin", "manageRoles").allowed).toBe(true);
	});

	test("unknown role/operation are typed errors, never guessed allows", () => {
		expect(() => checkAccess("root", "logout")).toThrow();
		expect(() => checkAccess("viewer", "selfDestruct")).toThrow();
	});

	test("allowed iff rank ≥ minimum (pure monotone gate)", () => {
		fc.assert(
			fc.property(
				fc.constantFrom<Role>(...ROLE_ORDER),
				fc.constantFrom(...AUTHZ_BAND.map((o) => o.name)),
				(role, op) => {
					const band = AUTHZ_BAND.find((o) => o.name === op);
					if (!band) throw new Error("band");
					const rank: Record<Role, number> = { viewer: 0, editor: 1, admin: 2 };
					const want = rank[role] >= rank[band.minRole];
					expect(checkAccess(role, op).allowed).toBe(want);
				},
			),
		);
	});
});
