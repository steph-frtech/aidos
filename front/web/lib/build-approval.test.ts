import fc from "fast-check";
import { describe, expect, it } from "vitest";
import {
	type AgentTruthProposal,
	type AuthorityRoleBinding,
	admitted,
	buildInbox,
	CODE_AGENT_WRITE_ABOVE_WATERLINE,
	CODE_INSUFFICIENT_AUTHORITY,
	CODE_MISSING_MIRROR,
	CODE_NOT_A_TRUTH_WRITE,
	CODE_PLACEHOLDER_ACTOR,
	decide,
	isAboveWaterline,
	type MemberRole,
	proposeTruth,
	refuseDirectWrite,
} from "./build-approval";

/**
 * lib/build-approval.test.ts — the S85 REPRODUCIBILITY mirror (fast-check), the TS half of the
 * twin. It pins the determinism-first laws AND the parity with the Go authority
 * (back/runtime/buildloop/approval): the wall refuses every above-waterline direct write;
 * proposeTruth ONLY ever yields `proposed`; decide is re-derived from the authority verdict and
 * never trusts a forged status; the inbox surfaces exactly the project's proposed proposals.
 */

const aboveTargets = [
	"kernel.operation",
	"kernel.policy",
	"mirrors.record",
	"fitness.grammar",
	"back/kernel/entities",
];
const belowTargets = [
	"archive.content",
	"changesets.draft",
	"brain.memory",
	"context.pack",
];
const bindings: AuthorityRoleBinding[] = [
	{ domain: "checkout", minProjectRole: "owner", roles: ["product_owner"] },
];

describe("S85 build-approval twin", () => {
	// PROPERTY 1 — the wall refuses every above-waterline DIRECT write.
	it("refuses every above-waterline direct write (AGENT_WRITE_ABOVE_WATERLINE)", () => {
		fc.assert(
			fc.property(fc.constantFrom(...aboveTargets), (target) => {
				const br = refuseDirectWrite(target);
				expect(br?.code).toBe(CODE_AGENT_WRITE_ABOVE_WATERLINE);
			}),
		);
	});

	// PROPERTY 2 — a below-the-line target is no truth: the wall refuses nothing, propose refuses it.
	it("a below-the-line target is not a truth", () => {
		fc.assert(
			fc.property(fc.constantFrom(...belowTargets), (target) => {
				expect(refuseDirectWrite(target)).toBeUndefined();
				expect(isAboveWaterline(target)).toBe(false);
				const r = proposeTruth("a", "proj-A", "run", {
					target,
					domain: "checkout",
					truthKind: "journey",
					mirror: "m",
				});
				expect(r.ok).toBe(false);
				if (!r.ok) expect(r.block.code).toBe(CODE_NOT_A_TRUTH_WRITE);
			}),
		);
	});

	// PROPERTY 3 — proposeTruth is deterministic and ONLY ever yields `proposed`.
	it("proposeTruth is deterministic and never admits", () => {
		fc.assert(
			fc.property(
				fc.constantFrom(...aboveTargets),
				fc.constantFrom("checkout", "billing"),
				fc.constantFrom("mirror://a", "mirror://b"),
				(target, domain, mirror) => {
					const tw = { target, domain, truthKind: "journey", mirror };
					const r1 = proposeTruth("a", "proj-A", "run", tw);
					const r2 = proposeTruth("a", "proj-A", "run", tw);
					expect(r1.ok).toBe(true);
					if (r1.ok && r2.ok) {
						expect(r1.proposal.id).toBe(r2.proposal.id);
						expect(r1.proposal.status).toBe("proposed");
					}
				},
			),
		);
	});

	// PROPERTY 4 — a truth with no mirror is a monster (MISSING_MIRROR).
	it("a truth with no mirror is refused MISSING_MIRROR", () => {
		const r = proposeTruth("a", "proj-A", "run", {
			target: "kernel.operation",
			domain: "checkout",
			truthKind: "journey",
			mirror: "",
		});
		expect(r.ok).toBe(false);
		if (!r.ok) expect(r.block.code).toBe(CODE_MISSING_MIRROR);
	});

	// PROPERTY 5 — decide is re-derived from authority, never the (possibly forged) input status.
	it("admits ONLY a real owner; re-derives a forged status away", () => {
		fc.assert(
			fc.property(
				fc.constantFrom<MemberRole>("owner", "editor", "viewer"),
				(role) => {
					const r = proposeTruth("a", "proj-A", "run", {
						target: "kernel.operation",
						domain: "checkout",
						truthKind: "journey",
						mirror: "m",
					});
					expect(r.ok).toBe(true);
					if (!r.ok) return;
					// Forge an admitted status on the input — it must be ignored.
					const forged: AgentTruthProposal = {
						...r.proposal,
						status: "admitted",
					};
					const d = decide(
						"checkout",
						["product_owner"],
						{ identity: "u", display: "User" },
						role,
						bindings,
					);
					if (role === "owner") {
						expect(d.admitted).toBe(true);
						expect(admitted(forged, d).status).toBe("admitted");
					} else {
						expect(d.admitted).toBe(false);
						expect(d.block?.code).toBe(CODE_INSUFFICIENT_AUTHORITY);
						// A non-admission leaves the truth un-landed, even with a forged input.
						expect(admitted(forged, d).status).toBe("proposed");
					}
				},
			),
		);
	});

	// PROPERTY 6 — a placeholder actor can never admit.
	it("a placeholder actor can never admit (PLACEHOLDER_ACTOR)", () => {
		fc.assert(
			fc.property(fc.constantFrom("agent", "system", "", "tbd"), (id) => {
				const d = decide(
					"checkout",
					["product_owner"],
					{ identity: id, display: "x" },
					"owner",
					bindings,
				);
				expect(d.admitted).toBe(false);
				expect(d.block?.code).toBe(CODE_PLACEHOLDER_ACTOR);
			}),
		);
	});

	// (bonus) the inbox surfaces exactly the project's proposed proposals, project-isolated.
	it("the inbox surfaces exactly the project's proposed proposals", () => {
		const mk = (
			project: string,
			mirror: string,
			status: "proposed" | "admitted",
		) => {
			const r = proposeTruth("a", project, "run", {
				target: "kernel.operation",
				domain: "checkout",
				truthKind: "journey",
				mirror,
			});
			if (!r.ok) throw new Error("unexpected");
			return { ...r.proposal, status };
		};
		const all = [
			mk("proj-A", "m1", "proposed"),
			mk("proj-A", "m2", "admitted"), // landed → excluded
			mk("proj-B", "m3", "proposed"), // other project
		];
		const inbox = buildInbox("proj-A", all);
		expect(inbox.pending).toHaveLength(1);
		expect(inbox.pending[0].truth.mirror).toBe("m1");
	});
});
