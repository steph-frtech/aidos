/**
 * auth-gate.test.ts — the S61 reproducibility mirror for the composed gate
 * (Vitest + fast-check). Pins: an UNAUTHENTICATED call to a truth-write endpoint is
 * refused with UNAUTHENTICATED upstream of routing (no tool, no data); an authenticated
 * below-the-line call routes under the verified identity; an authenticated truth-write is
 * still refused by the zone wall; auth ≠ authz (wrong project still refused by scope).
 */

import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { authenticatedRoute, refuseUnauthenticated } from "./auth-gate";
import { CODE_UNAUTHENTICATED, type Principal } from "./authn";
import { CODE_TRUTH_WRITE_NEEDS_CHANGESET } from "./gateway";
import { CODE_AGENT_CROSS_PROJECT_WRITE } from "./projectWall";

const TRUTH_WRITE_TOOLS_FOR_TEST = [
	"kernel_write",
	"mirror_write",
	"fitness_write",
] as const;

const alice: Principal = {
	identity: "user-alice",
	email: "a@x",
	provider: "oidc",
};

describe("auth-gate twin (S61) — authentication is layer 0, upstream of routing", () => {
	it("∀ truth-write tool, an anonymous call → UNAUTHENTICATED, no tool, no data", () => {
		fc.assert(
			fc.property(
				fc.constantFrom(...TRUTH_WRITE_TOOLS_FOR_TEST),
				fc.stringMatching(/^[a-z0-9-]{1,12}$/),
				(tool, proj) => {
					const r = refuseUnauthenticated(proj, tool);
					expect(r?.code).toBe(CODE_UNAUTHENTICATED);
					const d = authenticatedRoute(
						{ identity: "", email: "", provider: "" },
						tool,
						{ identity: "", activeProject: proj },
						{ projectId: proj, claimedIdentity: "" },
					);
					expect(d.outcome).toBe("unauthenticated");
					expect(d.tool).toBeUndefined();
				},
			),
		);
	});

	it("an anonymous below-the-line read is ALSO refused (no anonymous door)", () => {
		const d = authenticatedRoute(
			{ identity: "", email: "", provider: "" },
			"store_get",
			{ identity: "", activeProject: "proj-a" },
			{ projectId: "proj-a", claimedIdentity: "" },
		);
		expect(d.outcome).toBe("unauthenticated");
		expect(d.tool).toBeUndefined();
	});

	it("an authenticated below-the-line call routes under the verified identity", () => {
		const d = authenticatedRoute(
			alice,
			"store_get",
			{ identity: "stale-or-forged", activeProject: "proj-a" },
			{ projectId: "proj-a", claimedIdentity: "user-alice" },
		);
		expect(d.outcome).toBe("route");
		expect(d.tool?.name).toBe("store_get");
	});

	it("an authenticated truth-write is still refused by the ZONE wall", () => {
		const d = authenticatedRoute(
			alice,
			"kernel_write",
			{ identity: "", activeProject: "proj-a" },
			{ projectId: "proj-a", claimedIdentity: "" },
		);
		expect(d.outcome).toBe("refused_truth_write");
		expect(d.blockReason?.code).toBe(CODE_TRUTH_WRITE_NEEDS_CHANGESET);
	});

	it("auth ≠ authz — an authenticated WRONG-project call is refused by scope", () => {
		const d = authenticatedRoute(
			alice,
			"store_get",
			{ identity: "", activeProject: "proj-a" },
			{ projectId: "proj-b", claimedIdentity: "" },
		);
		expect(d.outcome).toBe("refused_scope");
		expect(d.blockReason?.code).toBe(CODE_AGENT_CROSS_PROJECT_WRITE);
	});

	it("deterministic — same input → same outcome", () => {
		fc.assert(
			fc.property(fc.constantFrom(...TRUTH_WRITE_TOOLS_FOR_TEST), (tool) => {
				expect(refuseUnauthenticated("proj-a", tool)?.code).toBe(
					refuseUnauthenticated("proj-a", tool)?.code,
				);
			}),
		);
	});
});
