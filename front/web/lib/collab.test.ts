import fc from "fast-check";
import { describe, expect, it } from "vitest";
import {
	type Act,
	type Actor,
	authorize,
	canAdvance,
	canApprove,
	claimLock,
	comment,
	type FeedEntry,
	feed,
	invite,
	isPresent,
	join,
	newCanvas,
	presentCount,
	type Role,
	record,
	releaseLock,
	stageFor,
} from "./collab";

/**
 * lib/collab.test.ts — the S113 front INVARIANT mirror (fast-check) + the
 * determinism-first reproducibility property, the TS twin of
 * back/runtime/collab/collab_property_test.go. Same input ⇒ same output.
 */

const ROLES: Role[] = ["owner", "editor", "viewer"];
const ADMIN_ACTS: Act[] = ["invite", "approve"];
const READ_ACTS: Act[] = ["comment", "share"];

function actorWith(
	identity: string,
	projectId: string,
	role: Role,
	isMember: boolean,
): Actor {
	return { identity, projectId, role: isMember ? role : null };
}

describe("collab authorize — done-criteria", () => {
	it("a member WITHOUT administer authority can never approve/invite", () => {
		fc.assert(
			fc.property(
				fc.constantFrom("p1", "alpha", "beta"),
				fc.constantFrom(...ROLES),
				fc.constantFrom(...ADMIN_ACTS),
				fc.stringMatching(/^[a-z]{1,8}$/),
				fc.boolean(),
				(proj, role, act, ident, isMember) => {
					const d = authorize(actorWith(ident, proj, role, isMember), act);
					if (!isMember) {
						expect(d.verdict).toBe("deny");
						expect(d.blockReason?.code).toBe("NOT_A_MEMBER");
					} else if (role === "owner") {
						expect(d.verdict).toBe("allow");
					} else {
						expect(d.verdict).toBe("deny");
						expect(d.blockReason?.code).toBe("ROLE_FORBIDDEN");
					}
				},
			),
		);
	});

	it("a viewer/editor cannot approve, only an owner can (canApprove)", () => {
		expect(
			canApprove({ identity: "vic", projectId: "p", role: "viewer" }),
		).toBe(false);
		expect(
			canApprove({ identity: "edd", projectId: "p", role: "editor" }),
		).toBe(false);
		expect(
			canApprove({ identity: "olive", projectId: "p", role: "owner" }),
		).toBe(true);
	});

	it("any member may do a read act (comment/share); a non-member is refused", () => {
		fc.assert(
			fc.property(
				fc.constantFrom(...ROLES),
				fc.constantFrom(...READ_ACTS),
				fc.boolean(),
				(role, act, isMember) => {
					const d = authorize(actorWith("u", "p", role, isMember), act);
					expect(d.verdict).toBe(isMember ? "allow" : "deny");
				},
			),
		);
	});

	it("an unidentified actor is ALWAYS refused UNIDENTIFIED_ACTOR (provenance never placeholder)", () => {
		fc.assert(
			fc.property(
				fc.constantFrom("", "   "),
				fc.constantFrom("p1", "alpha", ""),
				fc.constantFrom<Act>("comment", "share", "invite", "approve"),
				(blank, proj, act) => {
					const d = authorize(
						{ identity: blank, projectId: proj, role: null },
						act,
					);
					expect(d.verdict).toBe("deny");
					expect(d.blockReason?.code).toBe("UNIDENTIFIED_ACTOR");
				},
			),
		);
	});
});

describe("collab comment — provenance + content address", () => {
	it("a comment is stamped with the REAL author and is content-addressed/idempotent", () => {
		fc.assert(
			fc.property(
				fc.constantFrom(...ROLES),
				fc.stringMatching(/^[a-z]{1,8}$/),
				fc.stringMatching(/^[a-z0-9-]{1,10}$/),
				fc.stringMatching(/^[a-z ]{1,20}$/),
				(role, ident, target, body) => {
					const a = actorWith(ident, "p", role, true);
					const r1 = comment(a, "idea", target, body);
					if (r1.decision.verdict !== "allow") return; // empty-after-trim, not the path
					expect(r1.comment?.author).toBe(ident);
					expect(r1.comment?.id).not.toBe("");
					const r2 = comment(a, "idea", target, body);
					expect(r2.comment?.id).toBe(r1.comment?.id); // idempotent
				},
			),
		);
	});

	it("an unidentified actor records NO comment", () => {
		const r = comment(
			{ identity: "", projectId: "p", role: null },
			"idea",
			"i1",
			"x",
		);
		expect(r.comment).toBeUndefined();
		expect(r.decision.verdict).toBe("deny");
	});
});

describe("collab invite — administer only, real provenance", () => {
	it("only an owner may invite; the inviter is the real actor", () => {
		expect(
			invite({ identity: "edd", projectId: "p", role: "editor" }, "n", "viewer")
				.invite,
		).toBeUndefined();
		const r = invite(
			{ identity: "olive", projectId: "p", role: "owner" },
			"newbie",
			"editor",
		);
		expect(r.invite?.inviter).toBe("olive");
		expect(r.invite?.invitee).toBe("newbie");
	});
});

describe("collab feed — real actors, deterministic order", () => {
	it("orders by seq then id and stamps the real actor", () => {
		const a = (id: string): Actor => ({
			identity: id,
			projectId: "p",
			role: "editor",
		});
		const e2 = record(a("alice"), "comment", "t", 2).entry as FeedEntry;
		const e1 = record(a("bob"), "share", "t", 1).entry as FeedEntry;
		const ordered = feed([e2, e1]);
		expect(ordered[0].seq).toBe(1);
		expect(ordered[0].actor).toBe("bob");
		expect(ordered[1].seq).toBe(2);
	});
});

describe("collab presence — two users, no overwrite", () => {
	it("a join NEVER drops an already-present user", () => {
		fc.assert(
			fc.property(
				fc.uniqueArray(fc.stringMatching(/^[a-z]{1,6}$/), {
					minLength: 1,
					maxLength: 5,
				}),
				(idents) => {
					let c = newCanvas("c1", "p");
					for (const id of idents) {
						c = join(c, { identity: id, projectId: "p", role: null }).canvas;
					}
					for (const id of idents) expect(isPresent(c, id)).toBe(true);
					expect(presentCount(c)).toBe(idents.length);
				},
			),
		);
	});

	it("a concurrent lock claim never silently steals a held lock", () => {
		const alice: Actor = { identity: "alice", projectId: "p", role: null };
		const bob: Actor = { identity: "bob", projectId: "p", role: null };
		let c = join(newCanvas("c1", "p"), alice).canvas;
		c = join(c, bob).canvas;
		const held = claimLock(c, alice);
		expect(held.canvas.lockHolder).toBe("alice");
		const stolen = claimLock(held.canvas, bob);
		expect(stolen.decision.verdict).toBe("deny");
		expect(stolen.canvas.lockHolder).toBe("alice");
		const released = releaseLock(held.canvas, alice);
		const reclaimed = claimLock(released, bob);
		expect(reclaimed.canvas.lockHolder).toBe("bob");
	});
});

describe("collab stage — per-project ladder, gate computed", () => {
	it("a bare project cannot advance; the verdict equals the gate state", () => {
		fc.assert(
			fc.property(
				fc.uniqueArray(
					fc.constantFrom(
						"tests",
						"mutation",
						"one-cell",
						"kernel",
						"mirror",
						"reality-mirror-live",
						"context-graph",
						"memory",
						"evolve",
						"quality-diversity",
						"evolution-sandbox",
					),
				),
				(caps) => {
					const ps1 = stageFor("alpha", caps);
					const ps2 = stageFor("alpha", caps);
					expect(ps1).toEqual(ps2); // reproducible
					const adv = canAdvance(ps1);
					const gateMet = !ps1.allSatisfied && ps1.nextGaps.length === 0;
					expect(adv.ok).toBe(gateMet);
				},
			),
		);
	});

	it("a project with only the floor capabilities surfaces a next dent + gaps", () => {
		const ps = stageFor("alpha", []);
		expect(ps.next).not.toBe("");
		expect(ps.nextGaps.length).toBeGreaterThan(0);
		expect(canAdvance(ps).ok).toBe(false);
		expect(canAdvance(ps).reason?.code).toBe("STAGE_GATE_UNMET");
	});
});
