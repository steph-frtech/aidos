/**
 * gateway.test.ts — the S58 reproducibility mirror for the gateway TS twin (Vitest +
 * fast-check, the frozen front N1 slot). It pins the determinism-first done-criterion
 * ("pur routage, zéro LLM"): route() is a pure total function — same input → same
 * decision, always terminal, the wall never widens — and it matches the Go authority.
 */

import fc from "fast-check";
import { describe, expect, it } from "vitest";
import {
	CODE_TRUTH_WRITE_NEEDS_CHANGESET,
	CODE_UNKNOWN_TOOL,
	defaultTools,
	GATEWAY_SERVERS,
	route,
	tools,
} from "./gateway";
import { CODE_AGENT_CROSS_PROJECT_WRITE } from "./projectWall";

const toolNames = tools().map((t) => t.name);

describe("gateway.route — determinism & totality", () => {
	it("is deterministic: same input → same decision", () => {
		fc.assert(
			fc.property(
				fc.constantFrom("", "alice", "bob"),
				fc.constantFrom("", "proj-a", "proj-b"),
				fc.constantFrom("", "proj-a", "proj-b"),
				fc.constantFrom("", "alice", "mallory"),
				fc.constantFrom("nonexistent", "", ...toolNames),
				(identity, active, target, claimed, tool) => {
					const a = route({ identity, activeProject: active }, tool, {
						projectId: target,
						claimedIdentity: claimed,
					});
					const b = route({ identity, activeProject: active }, tool, {
						projectId: target,
						claimedIdentity: claimed,
					});
					expect(a).toEqual(b);
				},
			),
		);
	});

	it("is total & terminal: route carries a tool, a refusal carries a block reason", () => {
		fc.assert(
			fc.property(
				fc.constantFrom("", "alice", "bob"),
				fc.constantFrom("", "proj-a", "proj-b"),
				fc.constantFrom("", "proj-a", "proj-b"),
				fc.constantFrom("", "alice", "mallory"),
				fc.constantFrom("nope", "", ...toolNames),
				(identity, active, target, claimed, tool) => {
					const d = route({ identity, activeProject: active }, tool, {
						projectId: target,
						claimedIdentity: claimed,
					});
					if (d.outcome === "route") {
						expect(d.tool).toBeDefined();
						expect(d.blockReason).toBeUndefined();
					} else {
						expect(d.blockReason).toBeDefined();
					}
				},
			),
		);
	});

	it("never widens scope: a cross-project / forged call is never routed", () => {
		fc.assert(
			fc.property(
				fc.constantFrom(...toolNames),
				fc.constantFrom(
					{ projectId: "proj-b", claimedIdentity: "" },
					{ projectId: "proj-a", claimedIdentity: "mallory" },
				),
				(tool, bad) => {
					const d = route(
						{ identity: "alice", activeProject: "proj-a" },
						tool,
						bad,
					);
					expect(d.outcome).toBe("refused_scope");
					expect(d.blockReason?.code).toBe(CODE_AGENT_CROSS_PROJECT_WRITE);
				},
			),
		);
	});

	it("always refuses a truth-write with the ChangeSet hint", () => {
		for (const tool of ["kernel_write", "mirror_write", "fitness_write"]) {
			const d = route({ identity: "alice", activeProject: "proj-a" }, tool, {
				projectId: "proj-a",
			});
			expect(d.outcome).toBe("refused_truth_write");
			expect(d.blockReason?.code).toBe(CODE_TRUTH_WRITE_NEEDS_CHANGESET);
		}
	});

	it("refuses an unknown tool", () => {
		const d = route(
			{ identity: "alice", activeProject: "proj-a" },
			"definitely_not_a_tool",
			{ projectId: "proj-a" },
		);
		expect(d.outcome).toBe("unknown_tool");
		expect(d.blockReason?.code).toBe(CODE_UNKNOWN_TOOL);
	});

	it("routes a below-the-line call straight through", () => {
		const d = route(
			{ identity: "alice", activeProject: "proj-a" },
			"store_get",
			{ projectId: "proj-a" },
		);
		expect(d.outcome).toBe("route");
		expect(d.tool?.name).toBe("store_get");
	});
});

describe("gateway registry completeness", () => {
	it("exposes ≥1 tool per fronted server", () => {
		const byServer = new Map<string, number>();
		for (const t of defaultTools()) {
			byServer.set(t.server, (byServer.get(t.server) ?? 0) + 1);
		}
		for (const s of GATEWAY_SERVERS) {
			expect(byServer.get(s) ?? 0).toBeGreaterThan(0);
		}
	});

	it("defaultTools is reproducible", () => {
		expect(defaultTools()).toEqual(defaultTools());
	});

	it("fronts the DP13 provision server (the 14th) with the stack tools", () => {
		expect(GATEWAY_SERVERS).toContain("provision");
		// the five DP13 stack.* projections route below the line (never the kernel).
		for (const tool of [
			"stack.emit",
			"stack.select_profile",
			"stack.bootstrap",
			"stack.resolve_ports",
			"stack.print_urls",
		]) {
			const d = route({ identity: "alice", activeProject: "proj-a" }, tool, {
				projectId: "proj-a",
			});
			expect(d.outcome).toBe("route");
			expect(d.tool?.server).toBe("provision");
		}
	});

	it("refuses stack.engrave_manifest as a truth-write (a manifest is truth)", () => {
		const d = route(
			{ identity: "alice", activeProject: "proj-a" },
			"stack.engrave_manifest",
			{
				projectId: "proj-a",
			},
		);
		expect(d.outcome).toBe("refused_truth_write");
		expect(d.blockReason?.code).toBe(CODE_TRUTH_WRITE_NEEDS_CHANGESET);
	});
});
