import fc from "fast-check";
import { describe, expect, it } from "vitest";
import {
	type AuthorityGraph,
	appliedCount,
	applyConcurrent,
	approve,
	decide,
	isRecorded,
	type Proposal,
	provenance,
	staleProposals,
} from "./truth-approval";

const graph: AuthorityGraph = {
	domain: "checkout",
	truthKind: "behaviour",
	approvers: ["product_owner", "security"],
	veto: ["legal"],
	escalation: ["architecture_board"],
};

function prop(actor: string, head: string, granted: string[]): Proposal {
	return {
		actor,
		domain: "checkout",
		truthKind: "behaviour",
		head,
		granted,
		label: `${actor} discount`,
		spec: { kind: "add", target: "Order.discount" },
		mirror: { kind: "add", target: "Order.discount.mirror" },
	};
}

describe("truth-approval twin (S110)", () => {
	it("fixture: a veto blocks an approval, head unmoved", () => {
		const d = approve(
			graph,
			prop("alice", "head-0", ["product_owner", "security", "legal"]),
			"head-0",
		);
		expect(d.outcome).toBe("blocked");
		expect(d.blockCode).toBe("VETOED");
		expect(d.newHead).toBeUndefined();
	});

	it("fixture: a fully-recorded override lands the write with provenance", () => {
		const d = approve(
			graph,
			prop("alice", "head-0", ["product_owner", "security", "legal"]),
			"head-0",
			{
				by: "cto",
				reason: "cleared",
				adr: "ADR-0016",
			},
		);
		expect(d.outcome).toBe("applied");
		expect(d.override?.by).toBe("cto");
		expect(d.override?.adr).toBe("ADR-0016");
		expect(d.envelopeStatus).toBe("APPLIED");
	});

	it("fixture: an override without an ADR is refused (no silent bypass)", () => {
		const d = approve(
			graph,
			prop("alice", "head-0", ["product_owner", "security", "legal"]),
			"head-0",
			{
				by: "cto",
				reason: "hotfix",
				adr: "",
			},
		);
		expect(d.outcome).toBe("blocked");
		expect(d.override).toBeUndefined();
	});

	it("godog: two concurrent proposals on one head — exactly one lands, the other is stale", () => {
		const ds = applyConcurrent(graph, "head-0", [
			prop("alice", "head-0", ["product_owner", "security"]),
			prop("bob", "head-0", ["product_owner", "security"]),
		]);
		expect(appliedCount(ds)).toBe(1);
		expect(ds[0].outcome).toBe("applied");
		expect(ds[1].outcome).toBe("stale_head");
		expect(ds[1].staleAgainst).toBe(ds[0].newHead);
		expect(staleProposals(ds)).toEqual(["bob"]);
	});

	it("godog: the stale member re-runs against the new head and lands", () => {
		const d1 = approve(
			graph,
			prop("alice", "head-0", ["product_owner", "security"]),
			"head-0",
		);
		const newHead = d1.newHead!;
		const bob = prop("bob", newHead, ["product_owner", "security"]);
		bob.label = "bob re-applies";
		const d2 = approve(graph, bob, newHead);
		expect(d2.outcome).toBe("applied");
		expect(d2.newHead).not.toBe(newHead);
	});

	it("fixture: a spec without a mirror is blocked by completeness", () => {
		const p = prop("alice", "head-0", ["product_owner", "security"]);
		p.mirror = undefined;
		const d = approve(graph, p, "head-0");
		expect(d.outcome).toBe("blocked");
		expect(d.blockCode).toBe("INCOMPLETE_CHANGESET");
	});

	const rolePool = ["product_owner", "security", "legal", "architecture_board"];
	const grantedArb = fc.subarray(rolePool);
	const headArb = fc.constantFrom("head-0", "head-1");

	it("property (reproducibility): same input → same approve verdict", () => {
		fc.assert(
			fc.property(grantedArb, headArb, headArb, (granted, head, live) => {
				const p = prop("alice", head, granted);
				const a = approve(graph, p, live);
				const b = approve(graph, p, live);
				expect(a.outcome).toBe(b.outcome);
				expect(a.newHead).toBe(b.newHead);
			}),
		);
	});

	it("property (the wall): never lands without admission AND a fresh head", () => {
		fc.assert(
			fc.property(grantedArb, headArb, headArb, (granted, head, live) => {
				const d = approve(graph, prop("alice", head, granted), live);
				if (d.outcome === "applied") {
					expect(d.admission).toBe("admitted");
					expect(head).toBe(live);
					expect(d.newHead).toBeTruthy();
				}
			}),
		);
	});

	it("property (anti-overwrite §9): at most one concurrent write lands", () => {
		fc.assert(
			fc.property(
				fc.array(fc.constantFrom("alice", "bob", "carol"), {
					minLength: 2,
					maxLength: 6,
				}),
				(actors) => {
					const proposals = actors.map((a, i) => {
						const p = prop(a, "head-0", ["product_owner", "security"]);
						p.label = `${a}-${i}`;
						return p;
					});
					const ds = applyConcurrent(graph, "head-0", proposals);
					expect(appliedCount(ds)).toBeLessThanOrEqual(1);
				},
			),
		);
	});

	it("property (anti-Goodhart): a veto blocks unless a fully-recorded override is present", () => {
		fc.assert(
			fc.property(grantedArb, (granted) => {
				const g = [...granted, "legal"];
				const blocked = approve(graph, prop("alice", "head-0", g), "head-0");
				expect(blocked.outcome).toBe("blocked");
				const overridden = approve(
					graph,
					prop("alice", "head-0", g),
					"head-0",
					{
						by: "cto",
						reason: "cleared",
						adr: "ADR-0016",
					},
				);
				expect(overridden.outcome).toBe("applied");
				expect(isRecorded(overridden.override)).toBe(true);
			}),
		);
	});

	it("provenance is deterministic and sorted", () => {
		const ds = applyConcurrent(graph, "head-0", [
			prop("bob", "head-0", ["product_owner", "security"]),
			prop("alice", "head-0", ["product_owner", "security"]),
		]);
		const pr = provenance(ds);
		expect(pr[0].actor <= pr[1].actor).toBe(true);
	});

	it("decide: partial approval escalates", () => {
		expect(decide(graph, ["product_owner"]).admission).toBe("escalated");
	});
});
