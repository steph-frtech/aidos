/**
 * workspace.test.ts — S82 reproducibility mirror (Vitest). It pins the front twin lib/workspace
 * BYTE-IDENTICALLY to the Go package back/runtime/workspace: the same content-addressed workspace id,
 * the same cross-project isolation (SANDBOX_ESCAPE), the same resource-kill (SANDBOX_RESOURCE_LIMIT).
 *
 * The Go ids are emitted from the Go package and asserted here so the two can never drift.
 */

import { describe, expect, it } from "vitest";
import {
	canAccess,
	canBuildPath,
	canObserve,
	canReachTruthStore,
	checkResources,
	helloWorldRelPath,
	type Limits,
	provision,
} from "./workspace";

const CAPS: Limits = {
	max_memory_mb: 512,
	max_cpu_millis: 2000,
	max_wall_seconds: 60,
	max_disk_mb: 1024,
};

// The byte-identical Go ids (emitted from back/runtime/workspace).
const GO_PROJ_A_ID =
	"9143e3c8bae17b5823a24ac63e4c3175073a16665f8128793985adc909814756";
const GO_PROJ_B_ID =
	"86922632f7f676900e14b7bae733b88a9617999d030d5b53860d4e1c1c71ab56";

describe("workspace front twin — byte-identity with Go", () => {
	it("provisions proj-a with the Go content-addressed id", () => {
		const a = provision({ projectId: "proj-a", vcs: "git", limits: CAPS });
		expect(a.id).toBe(GO_PROJ_A_ID);
		expect(a.root).toBe(".aidos/workspaces/proj-a");
		expect(a.zones).toEqual(["ideas", "spike", "src", "kernel/spec"]);
		expect(a.repo).toEqual({
			vcs: "git",
			worktree: ".aidos/workspaces/proj-a",
		});
	});

	it("provisions proj-b with a DIFFERENT Go id", () => {
		const b = provision({ projectId: "proj-b", vcs: "git", limits: CAPS });
		expect(b.id).toBe(GO_PROJ_B_ID);
		expect(b.id).not.toBe(GO_PROJ_A_ID);
	});

	it("is deterministic (same request → same id)", () => {
		const a1 = provision({ projectId: "proj-a", vcs: "git", limits: CAPS });
		const a2 = provision({ projectId: "proj-a", vcs: "git", limits: CAPS });
		expect(a1.id).toBe(a2.id);
	});
});

describe("cross-project isolation (SANDBOX_ESCAPE)", () => {
	const a = provision({ projectId: "proj-a", vcs: "git", limits: CAPS });
	const b = provision({ projectId: "proj-b", vcs: "git", limits: CAPS });

	it("A may read its own tree", () => {
		expect(canAccess(a, `${a.root}/src/main.go`).allowed).toBe(true);
	});

	it("A may NOT read B's tree (SANDBOX_ESCAPE)", () => {
		const d = canAccess(a, `${b.root}/build/out.bin`);
		expect(d.allowed).toBe(false);
		expect(d.blockCode).toBe("SANDBOX_ESCAPE");
	});

	it("A may NOT read the truth-store (the wall)", () => {
		const d = canAccess(a, `${".aidos/truth-store"}/kernel/x`);
		expect(d.allowed).toBe(false);
		expect(d.blockCode).toBe("SANDBOX_ESCAPE");
		expect(canReachTruthStore(a)).toBe(false);
	});

	it("distinct workspaces are pairwise non-observable", () => {
		expect(canObserve(a, b)).toBe(false);
		expect(canObserve(b, a)).toBe(false);
		expect(canObserve(a, a)).toBe(true);
	});

	it("a ../ traversal into another project is refused", () => {
		const d = canAccess(a, `${a.root}/../proj-b/src/secret.go`);
		expect(d.allowed).toBe(false);
	});
});

describe("resource-limit kill (SANDBOX_RESOURCE_LIMIT)", () => {
	const a = provision({ projectId: "proj-a", vcs: "git", limits: CAPS });

	it("a usage under every cap is not killed", () => {
		const v = checkResources(a, {
			memory_mb: 100,
			cpu_millis: 500,
			wall_seconds: 10,
			disk_mb: 200,
		});
		expect(v.killed).toBe(false);
	});

	it("a CPU runaway is killed on cpu with SANDBOX_RESOURCE_LIMIT", () => {
		const v = checkResources(a, {
			memory_mb: 0,
			cpu_millis: 999999,
			wall_seconds: 0,
			disk_mb: 0,
		});
		expect(v.killed).toBe(true);
		expect(v.reason).toBe("cpu");
		expect(v.blockCode).toBe("SANDBOX_RESOURCE_LIMIT");
	});

	it("a disk-filler is killed on disk", () => {
		const v = checkResources(a, {
			memory_mb: 0,
			cpu_millis: 0,
			wall_seconds: 0,
			disk_mb: 99999,
		});
		expect(v.killed).toBe(true);
		expect(v.reason).toBe("disk");
	});
});

describe("hello-world builds green inside", () => {
	const a = provision({ projectId: "proj-a", vcs: "git", limits: CAPS });
	it("the confined hello-world is build-confined", () => {
		expect(canBuildPath(a, helloWorldRelPath())).toBe(true);
	});
	it("a build writing outside the root is not confined", () => {
		expect(canBuildPath(a, "../escape.go")).toBe(false);
	});
});
