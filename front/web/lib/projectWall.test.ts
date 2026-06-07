import fc from "fast-check";
import { describe, expect, it } from "vitest";
import {
	CODE_AGENT_CROSS_PROJECT_WRITE,
	classify,
	isZeroScope,
	type Scope,
	type Target,
} from "./projectWall";

/**
 * projectWall.test.ts — the Vitest+fast-check twin of back/runtime/projectwall (S55).
 * Pins the front classifier to the Go authority byte-for-byte. The Go package is
 * authoritative; this twin asserts the SAME predicate and the SAME code string.
 */

describe("projectWall — cross-project scope classifier (S55 twin)", () => {
	it("code is byte-identical to the Go authority", () => {
		expect(CODE_AGENT_CROSS_PROJECT_WRITE).toBe("AGENT_CROSS_PROJECT_WRITE");
	});

	it("same project, inherited identity → allow", () => {
		const d = classify(
			{ identity: "alice", activeProject: "proj-a" },
			{ projectId: "proj-a" },
		);
		expect(d.verdict).toBe("allow");
		expect(d.blockReason).toBeUndefined();
	});

	it("cross project → deny with AGENT_CROSS_PROJECT_WRITE", () => {
		const d = classify(
			{ identity: "alice", activeProject: "proj-a" },
			{ projectId: "proj-b" },
		);
		expect(d.verdict).toBe("deny");
		expect(d.blockReason?.code).toBe(CODE_AGENT_CROSS_PROJECT_WRITE);
		expect(d.blockReason?.howToFix.length).toBeGreaterThan(0);
	});

	it("forged gateway identity (same project) → deny (S61 layer)", () => {
		const d = classify(
			{ identity: "alice", activeProject: "proj-a" },
			{ projectId: "proj-a", claimedIdentity: "mallory" },
		);
		expect(d.verdict).toBe("deny");
		expect(d.blockReason?.code).toBe(CODE_AGENT_CROSS_PROJECT_WRITE);
	});

	it("no active scope → fail-closed deny", () => {
		expect(
			classify({ identity: "", activeProject: "" }, { projectId: "p" }).verdict,
		).toBe("deny");
		expect(isZeroScope({ identity: "u", activeProject: "" })).toBe(true);
	});

	it("unscoped target (no project) → pass-through allow", () => {
		const d = classify(
			{ identity: "alice", activeProject: "proj-a" },
			{ projectId: "" },
		);
		expect(d.verdict).toBe("allow");
	});

	it("property: cross-project is ALWAYS denied (A scope never reaches a B row)", () => {
		fc.assert(
			fc.property(
				fc.stringMatching(/^[a-z]{1,6}$/),
				fc.stringMatching(/^[a-z]{1,6}$/),
				fc.stringMatching(/^[a-z]{1,6}$/),
				(id, a, b0) => {
					const b = a === b0 ? `${b0}x` : b0;
					const s: Scope = { identity: id, activeProject: a };
					const t: Target = { projectId: b };
					return classify(s, t).verdict === "deny";
				},
			),
		);
	});

	it("property: same project+identity is ALWAYS allowed", () => {
		fc.assert(
			fc.property(
				fc.stringMatching(/^[a-z]{1,6}$/),
				fc.stringMatching(/^[a-z]{1,6}$/),
				(id, p) => {
					const s: Scope = { identity: id, activeProject: p };
					return classify(s, { projectId: p }).verdict === "allow";
				},
			),
		);
	});

	it("property: classify is pure (same input → same verdict)", () => {
		fc.assert(
			fc.property(
				fc.string(),
				fc.string(),
				fc.string(),
				fc.string(),
				(id, proj, tgt, claim) => {
					const a = classify(
						{ identity: id, activeProject: proj },
						{ projectId: tgt, claimedIdentity: claim },
					);
					const b = classify(
						{ identity: id, activeProject: proj },
						{ projectId: tgt, claimedIdentity: claim },
					);
					return JSON.stringify(a) === JSON.stringify(b);
				},
			),
		);
	});
});
