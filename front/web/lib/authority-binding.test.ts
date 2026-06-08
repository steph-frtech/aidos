import fc from "fast-check";
import { describe, expect, it } from "vitest";
import {
	type AuthorityGraph,
	type AuthorityRoleBinding,
	decideProposal,
	isPlaceholder,
	type RealActor,
	resolveGrantedRoles,
	toProvenanceDetail,
	validateOverride,
} from "./authority-binding";
import type { Role } from "./membership";

/**
 * lib/authority-binding.test.ts — the S63 front mirror (done-criteria fixture + fast-check
 * reproducibility/invariant), the TS twin of
 * back/runtime/authoritybinding/authoritybinding_*_test.go. Same input ⇒ same verdict.
 */

const checkoutGraph: AuthorityGraph = {
	domain: "checkout",
	truthKind: "regulatory",
	approvers: ["product_owner"],
	veto: ["security"],
	escalation: ["architecture_board"],
};

const bindings: AuthorityRoleBinding[] = [
	{ domain: "checkout", minProjectRole: "owner", roles: ["product_owner"] },
];

const alice: RealActor = { identity: "user-alice", display: "Alice" };
const memberRoles: Role[] = ["owner", "editor", "viewer"];

describe("decideProposal — done-criteria", () => {
	it("an OWNER holding the scope authority ⇒ admitted", () => {
		const d = decideProposal(checkoutGraph, alice, "owner", bindings);
		expect(d.decision).toBe("admitted");
		expect(d.blockReason).toBeUndefined();
		expect(d.grantedRoles).toEqual(["product_owner"]);
	});

	it("a VIEWER (no scope authority) ⇒ INSUFFICIENT_AUTHORITY", () => {
		const d = decideProposal(
			checkoutGraph,
			{ identity: "user-bob", display: "Bob" },
			"viewer",
			bindings,
		);
		expect(d.decision).toBe("blocked");
		expect(d.blockReason?.code).toBe("INSUFFICIENT_AUTHORITY");
		expect(d.blockReason?.howToFix.length).toBeGreaterThan(0);
		expect(d.grantedRoles).toEqual([]);
	});

	it("a NON-MEMBER (null role) holds no authority ⇒ INSUFFICIENT_AUTHORITY", () => {
		const d = decideProposal(
			checkoutGraph,
			{ identity: "user-carol", display: "Carol" },
			null,
			bindings,
		);
		expect(d.blockReason?.code).toBe("INSUFFICIENT_AUTHORITY");
		expect(d.grantedRoles).toEqual([]);
	});

	it("a placeholder actor ⇒ PLACEHOLDER_ACTOR regardless of authority", () => {
		for (const ph of [
			"agent",
			"system",
			"",
			"  ",
			"tbd",
			"placeholder",
			"anonymous",
		]) {
			const d = decideProposal(
				checkoutGraph,
				{ identity: ph, display: "X" },
				"owner",
				bindings,
			);
			expect(d.blockReason?.code).toBe("PLACEHOLDER_ACTOR");
		}
		const blank = decideProposal(
			checkoutGraph,
			{ identity: "user-alice", display: "  " },
			"owner",
			bindings,
		);
		expect(blank.blockReason?.code).toBe("PLACEHOLDER_ACTOR");
	});

	it("a held VETO blocks admission (VETOED)", () => {
		const vetoBindings: AuthorityRoleBinding[] = [
			{
				domain: "checkout",
				minProjectRole: "owner",
				roles: ["product_owner", "security"],
			},
		];
		const d = decideProposal(checkoutGraph, alice, "owner", vetoBindings);
		expect(d.decision).toBe("blocked");
		expect(d.blockReason?.code).toBe("VETOED");
	});
});

describe("override — recorded decision", () => {
	const owner: RealActor = { identity: "user-owner", display: "Olga" };
	it("requires changeset + adr + reason + real actor", () => {
		expect(
			validateOverride({
				overriddenCode: "INSUFFICIENT_AUTHORITY",
				changeSetRef: "cs-1",
				adrRef: "ADR 0042",
				actor: owner,
				reason: "ok",
			}).ok,
		).toBe(true);
		expect(
			validateOverride({
				overriddenCode: "INSUFFICIENT_AUTHORITY",
				changeSetRef: "cs-1",
				adrRef: "",
				actor: owner,
				reason: "ok",
			}).blockReason?.code,
		).toBe("OVERRIDE_NOT_RECORDED");
		expect(
			validateOverride({
				overriddenCode: "INSUFFICIENT_AUTHORITY",
				changeSetRef: "",
				adrRef: "ADR 0042",
				actor: owner,
				reason: "ok",
			}).blockReason?.code,
		).toBe("OVERRIDE_NOT_RECORDED");
		expect(
			validateOverride({
				overriddenCode: "INSUFFICIENT_AUTHORITY",
				changeSetRef: "cs-1",
				adrRef: "ADR 0042",
				actor: owner,
				reason: "  ",
			}).blockReason?.code,
		).toBe("OVERRIDE_NOT_RECORDED");
		expect(
			validateOverride({
				overriddenCode: "INSUFFICIENT_AUTHORITY",
				changeSetRef: "cs-1",
				adrRef: "ADR 0042",
				actor: { identity: "system", display: "s" },
				reason: "ok",
			}).blockReason?.code,
		).toBe("PLACEHOLDER_ACTOR");
	});
});

describe("override content-address parity with the Go twin", () => {
	it("produces a BYTE-IDENTICAL content address to back/runtime/authoritybinding", async () => {
		const body = {
			actor_display: "Olga",
			actor_identity: "user-owner",
			adr_ref: "ADR 0042",
			changeset_ref: "cs-123",
			kind: "authority_override",
			overridden_code: "INSUFFICIENT_AUTHORITY",
			reason: "exception",
		};
		const bytes = new TextEncoder().encode(JSON.stringify(body));
		const digest = await crypto.subtle.digest("SHA-256", bytes);
		const id = [...new Uint8Array(digest)]
			.map((b) => b.toString(16).padStart(2, "0"))
			.join("");
		expect(id).toBe(
			"a5c38ff113a25a9f70bfc87a36f2249339bbdda3b8fbf977a3d8f6dae724046b",
		);
	});
});

describe("provenance names the real human", () => {
	it("attributes the intent to the named human", () => {
		expect(toProvenanceDetail(alice, "je veux une remise")).toBe(
			"Alice <user-alice>: je veux une remise",
		);
	});
});

describe("fast-check — reproducibility + invariants", () => {
	it("decideProposal is deterministic (same input ⇒ same verdict)", () => {
		fc.assert(
			fc.property(
				fc.constantFrom<Role>(...memberRoles),
				fc.boolean(),
				fc.string({ minLength: 1, maxLength: 8 }),
				(role, hasMember, ident) => {
					const actor: RealActor = { identity: ident, display: `D ${ident}` };
					const m = hasMember ? role : null;
					const a = decideProposal(checkoutGraph, actor, m, bindings);
					const b = decideProposal(checkoutGraph, actor, m, bindings);
					expect(a.decision).toBe(b.decision);
					expect(a.blockReason?.code).toBe(b.blockReason?.code);
					expect(a.grantedRoles).toEqual(b.grantedRoles);
				},
			),
		);
	});

	it("role gradient monotone: owner ⊇ editor ⊇ viewer", () => {
		fc.assert(
			fc.property(fc.constantFrom("checkout", "billing"), (domain) => {
				const ownerSet = new Set(
					resolveGrantedRoles("owner", domain, bindings),
				);
				const editorSet = new Set(
					resolveGrantedRoles("editor", domain, bindings),
				);
				const viewerSet = new Set(
					resolveGrantedRoles("viewer", domain, bindings),
				);
				for (const r of editorSet) expect(ownerSet.has(r)).toBe(true);
				for (const r of viewerSet) expect(editorSet.has(r)).toBe(true);
			}),
		);
	});

	it("a placeholder actor is always refused", () => {
		fc.assert(
			fc.property(
				fc.constantFrom(
					"",
					" ",
					"agent",
					"system",
					"aidos",
					"tbd",
					"placeholder",
					"anonymous",
					"unknown",
				),
				(ph) => {
					expect(isPlaceholder(ph)).toBe(true);
					const d = decideProposal(
						checkoutGraph,
						{ identity: ph, display: "X" },
						"owner",
						bindings,
					);
					expect(d.blockReason?.code).toBe("PLACEHOLDER_ACTOR");
				},
			),
		);
	});

	it("resolveGrantedRoles is sorted + deduped", () => {
		const dup: AuthorityRoleBinding[] = [
			{ domain: "checkout", minProjectRole: "viewer", roles: ["b", "a", "a"] },
			{ domain: "", minProjectRole: "viewer", roles: ["a", "c"] },
		];
		const got = resolveGrantedRoles("owner", "checkout", dup);
		expect(got).toEqual([...got].sort());
		expect(new Set(got).size).toBe(got.length);
	});
});
