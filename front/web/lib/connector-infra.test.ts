import fc from "fast-check";
import { describe, expect, it } from "vitest";
import type { Async, OutboxEntry } from "./async-operation";
import {
	canonicalFragment,
	DEMO_INBOUND_WEBHOOK,
	DEMO_REGISTERED_TOOLS,
	DEMO_UNREGISTERED_TOOL,
	DEMO_WEBHOOK_ASYNC,
	DEMO_WEBHOOK_OP,
	ERR_WEBHOOK_OPERATION_MISMATCH,
	hashFragment,
	INFRA_KEYS,
	isolationToken,
	newToolRegistry,
	realizeInboundWebhook,
	routeTool,
	substrateConnectorInfraFragments,
	TOOL_NOT_REGISTERED,
	writesTruth,
} from "./connector-infra";

/**
 * Reproducibility mirror (∀ + fixture) for the DP23 connector-infra TS twin — the front mirror of
 * back/runtime/connectorinfra. fast-check is the frozen front invariant slot (CLAUDE.md §3). The
 * invariants mirror connectorinfra_property_test.go + connectorinfra_fixture_test.go
 * verdict-for-verdict:
 *
 *  L1 — BYTE-IDENTITY        : same projectID ⇒ byte-identical fragments + same hashFragment (re-emission stable).
 *  L2 — CLOSED PALETTE       : exactly four fragments, the closed INFRA_KEYS set, profile connectors.
 *  L4 — PER-PROJECT ISOLATION: project A's fragment hash differs from project B's (the isolation token).
 *  L6 — PURE SET-MEMBERSHIP  : routeTool routes IFF the tool is registered; an empty registry refuses everything.
 *  WEBHOOK                   : an inbound webhook fires the target async op once (exactly-once relative on replay);
 *                              a webhook for the wrong operation is refused.
 *  WALL                      : writesTruth is always false.
 */

describe("DP23 connector-infra twin — fragments", () => {
	it("L1 — same projectID ⇒ byte-identical fragments + stable hash (re-emission stable)", () => {
		fc.assert(
			fc.property(fc.string({ minLength: 1, maxLength: 24 }), (projectID) => {
				const a = substrateConnectorInfraFragments(projectID);
				const b = substrateConnectorInfraFragments(projectID);
				expect(a.length).toBe(b.length);
				for (let i = 0; i < a.length; i++) {
					expect(canonicalFragment(a[i])).toBe(canonicalFragment(b[i]));
					expect(hashFragment(a[i])).toBe(hashFragment(b[i]));
				}
			}),
		);
	});

	it("L2 — the palette is exactly the closed four keys, profile connectors, role connector", () => {
		const frags = substrateConnectorInfraFragments("proj");
		expect(frags.map((f) => f.key)).toEqual([...INFRA_KEYS]);
		expect(frags.length).toBe(4);
		for (const f of frags) {
			expect(f.service.profile).toBe("connectors");
			expect(f.service.role).toBe("connector");
			expect(f.service.image).toBe(""); // ÉMIS — built, not pinned
			expect(f.service.internalPort).toBeGreaterThan(0);
			expect(f.service.healthcheck).not.toBe("");
			expect(f.volumes.length).toBeGreaterThan(0);
			expect(f.projectId).toBe("proj");
		}
	});

	it("L2bis — the canonical ports + depends_on edges are the declared closed table", () => {
		const frags = substrateConnectorInfraFragments("proj");
		const byKey = Object.fromEntries(frags.map((f) => [f.key, f]));
		expect(byKey["mcp-gateway"].service.internalPort).toBe(3900);
		expect(byKey["connector-registry"].service.internalPort).toBe(3910);
		expect(byKey["tool-registry"].service.internalPort).toBe(3920);
		expect(byKey["webhook-gateway"].service.internalPort).toBe(3930);
		expect(byKey["mcp-gateway"].service.dependsOn).toEqual(["tool-registry"]);
		expect(byKey["webhook-gateway"].service.dependsOn).toEqual(["nats"]);
	});

	it("L4 — per-project isolation: project A's hash differs from project B's", () => {
		fc.assert(
			fc.property(
				fc.string({ minLength: 1, maxLength: 16 }),
				fc.string({ minLength: 1, maxLength: 16 }),
				(pa, pb) => {
					fc.pre(pa !== pb && isolationToken(pa) !== isolationToken(pb));
					const a = substrateConnectorInfraFragments(pa);
					const b = substrateConnectorInfraFragments(pb);
					for (let i = 0; i < a.length; i++) {
						expect(hashFragment(a[i])).not.toBe(hashFragment(b[i]));
					}
				},
			),
		);
	});

	it("WALL — no fragment ever writes AIDOS truth (writesTruth is always false)", () => {
		for (const f of substrateConnectorInfraFragments("proj")) {
			expect(writesTruth(f)).toBe(false);
		}
	});
});

describe("DP23 connector-infra twin — Tool-Registry routing (MCP-Gateway, set-membership)", () => {
	it("L6 — a registered tool routes (admitted, no BlockReason)", () => {
		const registry = newToolRegistry("proj", [...DEMO_REGISTERED_TOOLS]);
		const { decision, blockReason } = routeTool(registry, "create_invoice");
		expect(decision.admitted).toBe(true);
		expect(decision.code).toBe("");
		expect(blockReason).toBeNull();
	});

	it("L6 — an unregistered tool is refused TOOL_NOT_REGISTERED with a resolution path", () => {
		const registry = newToolRegistry("proj", [...DEMO_REGISTERED_TOOLS]);
		const { decision, blockReason } = routeTool(
			registry,
			DEMO_UNREGISTERED_TOOL,
		);
		expect(decision.admitted).toBe(false);
		expect(decision.code).toBe(TOOL_NOT_REGISTERED);
		expect(blockReason).not.toBeNull();
		expect(blockReason?.code).toBe(TOOL_NOT_REGISTERED);
		expect(blockReason?.how_to_fix.length).toBeGreaterThan(0);
	});

	it("L6 — an EMPTY registry refuses EVERY tool (fail-closed, nothing exposed by default)", () => {
		const empty = newToolRegistry("proj", []);
		fc.assert(
			fc.property(fc.string(), (name) => {
				const { decision } = routeTool(empty, name);
				expect(decision.admitted).toBe(false);
				expect(decision.code).toBe(TOOL_NOT_REGISTERED);
			}),
		);
	});

	it("L6 — routing is a pure set-membership: registered ⇒ route, else refuse (any name)", () => {
		fc.assert(
			fc.property(
				fc.array(fc.string({ minLength: 1, maxLength: 12 }), { maxLength: 8 }),
				fc.string({ minLength: 1, maxLength: 12 }),
				(names, probe) => {
					const registry = newToolRegistry("proj", names);
					const { decision } = routeTool(registry, probe);
					expect(decision.admitted).toBe(names.includes(probe));
				},
			),
		);
	});
});

describe("DP23 connector-infra twin — inbound webhook ⇒ async op (S73/DP16 reused)", () => {
	it("an inbound webhook fires the target async op once", () => {
		const outbox: OutboxEntry[] = [];
		const dispatched = new Set<string>();
		const { events, error } = realizeInboundWebhook(
			DEMO_INBOUND_WEBHOOK,
			DEMO_WEBHOOK_OP,
			DEMO_WEBHOOK_ASYNC,
			outbox,
			dispatched,
		);
		expect(error).toBeNull();
		expect(events.length).toBe(1);
		expect(events[0].operation).toBe(DEMO_WEBHOOK_OP);
		expect(events[0].kind).toBe("notification");
		expect(events[0].target).toBe("ops@example.com");
	});

	it("replaying the SAME webhook delivers the effect once observably (exactly-once relative)", () => {
		const outbox: OutboxEntry[] = [];
		const dispatched = new Set<string>();
		const first = realizeInboundWebhook(
			DEMO_INBOUND_WEBHOOK,
			DEMO_WEBHOOK_OP,
			DEMO_WEBHOOK_ASYNC,
			outbox,
			dispatched,
		);
		expect(first.events.length).toBe(1);
		const replay = realizeInboundWebhook(
			DEMO_INBOUND_WEBHOOK,
			DEMO_WEBHOOK_OP,
			DEMO_WEBHOOK_ASYNC,
			outbox,
			dispatched,
		);
		expect(replay.error).toBeNull();
		expect(replay.events.length).toBe(0); // the redelivery is suppressed
	});

	it("a webhook for the wrong operation is refused (never fires the wrong op)", () => {
		const outbox: OutboxEntry[] = [];
		const dispatched = new Set<string>();
		const wrong: Async = DEMO_WEBHOOK_ASYNC;
		const { events, error } = realizeInboundWebhook(
			{ source: "stripe", operation: "somethingElse" },
			DEMO_WEBHOOK_OP,
			wrong,
			outbox,
			dispatched,
		);
		expect(error).toBe(ERR_WEBHOOK_OPERATION_MISMATCH);
		expect(events.length).toBe(0);
	});
});
