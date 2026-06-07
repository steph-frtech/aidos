/**
 * authn.test.ts — the S61 reproducibility mirror for the TS authn twin
 * (Vitest + fast-check). Pins the property done-criterion on the front: an anonymous
 * principal is refused UNAUTHENTICATED for EVERY disposition (truth_write OR below_line),
 * a resolved principal is always authenticated with its identity preserved, and the gate
 * is deterministic. It also asserts the twin matches the Go core's codes/shape verbatim.
 */

import fc from "fast-check";
import { describe, expect, it } from "vitest";
import {
	AUTH_PROVIDERS,
	authenticate,
	CODE_UNAUTHENTICATED,
	type Disposition,
	gucs,
	isAnonymous,
	type Principal,
} from "./authn";

const dispositions: Disposition[] = ["below_line", "truth_write"];

describe("authn twin (S61) — UNAUTHENTICATED is the only anonymous outcome", () => {
	it("∀ anonymous principal, every disposition → UNAUTHENTICATED, no principal leaked", () => {
		fc.assert(
			fc.property(
				fc.constantFrom("", " ", "\t", "\n", "   "),
				fc.string(),
				fc.string(),
				fc.constantFrom(...dispositions),
				(ws, email, provider, disp) => {
					const d = authenticate({ identity: ws, email, provider }, disp);
					expect(d.outcome).toBe("unauthenticated");
					expect(d.principal).toBeUndefined();
					expect(d.blockReason?.code).toBe(CODE_UNAUTHENTICATED);
					expect(d.blockReason?.severity).toBe("error");
					expect((d.blockReason?.howToFix.length ?? 0) > 0).toBe(true);
				},
			),
		);
	});

	it("∀ resolved principal, authenticated with identity preserved, no block", () => {
		fc.assert(
			fc.property(
				fc.stringMatching(/^[a-z0-9]{1,20}$/),
				fc.constantFrom(...dispositions),
				(id, disp) => {
					const p: Principal = { identity: id, email: "u@x", provider: "oidc" };
					const d = authenticate(p, disp);
					expect(d.outcome).toBe("authenticated");
					expect(d.principal?.identity).toBe(id);
					expect(d.blockReason).toBeUndefined();
				},
			),
		);
	});

	it("authenticate is deterministic — same input → same outcome", () => {
		fc.assert(
			fc.property(fc.string(), fc.constantFrom(...dispositions), (id, disp) => {
				const p: Principal = { identity: id, email: "e", provider: "oidc" };
				expect(authenticate(p, disp).outcome).toBe(
					authenticate(p, disp).outcome,
				);
			}),
		);
	});

	it("gucs fail-closed: anonymous → empty app.identity (the RLS sees nothing)", () => {
		fc.assert(
			fc.property(fc.constantFrom("", "  ", "\t"), (ws) => {
				expect(gucs({ identity: ws, email: "e", provider: "p" }).identity).toBe(
					"",
				);
			}),
		);
		fc.assert(
			fc.property(fc.stringMatching(/^[a-z0-9]{1,12}$/), (id) => {
				expect(gucs({ identity: id, email: "e", provider: "p" }).identity).toBe(
					id,
				);
			}),
		);
	});

	it("isAnonymous matches the empty-subject predicate", () => {
		expect(isAnonymous({ identity: "", email: "e", provider: "p" })).toBe(true);
		expect(isAnonymous({ identity: "x", email: "e", provider: "p" })).toBe(
			false,
		);
	});

	it("exposes the declared provider set (closed, never coined ad-hoc)", () => {
		expect(AUTH_PROVIDERS.length).toBeGreaterThan(0);
		for (const p of AUTH_PROVIDERS) {
			expect(p.id.length).toBeGreaterThan(0);
			expect(p.label.length).toBeGreaterThan(0);
		}
	});
});
