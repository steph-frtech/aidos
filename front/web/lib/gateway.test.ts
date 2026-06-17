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

	// ── ADR 0092 batch-4A: the besoin-intake door's read/validate/capture tools resolve ──
	// The /besoin-intake panel reads LIVE via the passerelle — without the lookup resolving the flip
	// would be HOLLOW (route(besoin_graph_state)→unknown_tool→demo, the cliquet's blind spot). These
	// are ALL below-the-line: the read/validate tools are pure projections; the capture/emit tools
	// append a DRAFT idea via the legal idea_capture door (WroteKernel always false — a kernel write is
	// refused by GRANT). The besoin Store is RLS-scoped to `project` (S55) — the scope routes the GUC.
	it("fronts the besoin-intake server (the 31st) — every door tool routes below the line", () => {
		expect(GATEWAY_SERVERS).toContain("besoin-intake");
		for (const tool of [
			"besoin_graph_state",
			"besoin_level_schema",
			"besoin_list",
			"besoin_validate_level",
			"besoin_classify",
			"besoin_red_backlog",
			"besoin_capture_product",
			"besoin_capture_invariant",
			"besoin_emit_ideas",
			"besoin_capitalise",
		]) {
			const d = route({ identity: "alice", activeProject: "proj-a" }, tool, {
				projectId: "proj-a",
			});
			expect(d.outcome).toBe("route");
			expect(d.tool?.server).toBe("besoin-intake");
			expect(d.tool?.disposition).toBe("below_line");
		}
	});

	// ── ADR 0092 batch-4B PURE servers: the dispatched read tools resolve below the line ──
	// The four batch-4B servers (entity-modeler · shape-editor · context-map · grilling-loop) are
	// STATELESS + DETERMINISTIC (no DSN, no store). Each fronts only its CHEAP/pure READ tools; the
	// `*_propose` tools are DELIBERATELY ABSENT (a json.RawMessage ChangeSet body + a truth-proposal —
	// the panel keeps its propose→ChangeSet voie propre). Without the lookup resolving, the flip would
	// be HOLLOW (route(shape_derive)→unknown_tool→demo, the cliquet's blind spot).
	it("fronts the shape-editor server (the 36th) — its read tools route below the line", () => {
		expect(GATEWAY_SERVERS).toContain("shape-editor");
		for (const tool of ["shape_derive", "shape_parse", "shape_merge"]) {
			const d = route({ identity: "alice", activeProject: "proj-a" }, tool, {
				projectId: "proj-a",
			});
			expect(d.outcome).toBe("route");
			expect(d.tool?.server).toBe("shape-editor");
			expect(d.tool?.disposition).toBe("below_line");
		}
	});

	it("the shape-editor *_propose tool is NOT dispatched (the propose→ChangeSet voie propre)", () => {
		// shape_propose carries a json.RawMessage ChangeSet body + is a truth-proposal — it must NOT
		// resolve through the gateway (the panel proposes via the twin, the move rides the changeset gate).
		const d = route(
			{ identity: "alice", activeProject: "proj-a" },
			"shape_propose",
			{
				projectId: "proj-a",
			},
		);
		expect(d.outcome).toBe("unknown_tool");
		expect(d.blockReason?.code).toBe(CODE_UNKNOWN_TOOL);
	});

	// ── ADR 0092 batch-4B: the grilling-loop server (S65, EL06) — ALL THREE tools dispatch ──
	// grilling-loop is the ONE batch-4B server with NO *_propose tool: all three reads dispatch (no
	// RawMessage, scalar I/O). grill_route returns a VerdictRecord idea VALUE (a DRAFT; persistence
	// rides the idea_capture door, WroteKernel always false), grill_verify_verdict is the barricaded
	// LLM re-verify gate, grill_verdicts a closed-table read. Without the lookup resolving, the
	// /grilling-loop flip would be HOLLOW (route(grill_route)→unknown_tool→demo, the cliquet's blind
	// spot — exactly what the lib/grilling-loop-data.ts sibling + this dispatch entry prevent).
	it("fronts the grilling-loop server (the 38th) — all three read tools route below the line", () => {
		expect(GATEWAY_SERVERS).toContain("grilling-loop");
		for (const tool of [
			"grill_route",
			"grill_verify_verdict",
			"grill_verdicts",
		]) {
			const d = route({ identity: "alice", activeProject: "proj-a" }, tool, {
				projectId: "proj-a",
			});
			expect(d.outcome).toBe("route");
			expect(d.tool?.server).toBe("grilling-loop");
			expect(d.tool?.disposition).toBe("below_line");
		}
	});

	// A cross-project grill_route is refused at the edge (the wall, S55) — scope is checked BEFORE
	// the below-the-line route, so even a dispatched read cannot leak across projects.
	it("refuses a cross-project grill_route (scope checked before the route)", () => {
		const d = route(
			{ identity: "alice", activeProject: "proj-a" },
			"grill_route",
			{ projectId: "proj-b" },
		);
		expect(d.outcome).toBe("refused_scope");
		expect(d.blockReason?.code).toBe(CODE_AGENT_CROSS_PROJECT_WRITE);
	});
});
