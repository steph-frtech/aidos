"use server";

import {
	type AuthorityGraph,
	appliedCount,
	applyConcurrent,
	approve,
	type OverrideRecord,
	type Proposal,
	staleProposals,
} from "@/lib/truth-approval";
import {
	CONCURRENCY_INITIAL,
	type ConcurrencyView,
	GATE_INITIAL,
	type GateView,
	RELAND_INITIAL,
	type RelandView,
} from "./view";

/**
 * Server Actions for the /truth-approval cockpit (S110 — multi-human scoped truth-write approval +
 * content-addressed concurrency control).
 *
 * THE STEP: every truth-write via the cockpit passes propose → ChangeSet → approval gated by the
 * bound AuthorityGraph (approver/veto/escalation, S63) at the right TruthScope; concurrency is an
 * optimistic-lock on the content-addressed head — two concurrent applies → the second refused
 * STALE_HEAD, never last-write-wins (anti-overwrite §9). An override is a recorded decision
 * (provenance + ADR, §8).
 *
 * Three controls (all run the PURE twin lib/truth-approval — same input → identical outcome, never
 * an LLM; THE WALL §2: the cockpit WRITES NOTHING, it returns the envelope the CLI would apply):
 *   - gateAction: propose+approve one truth-write; a veto blocks, an override (with ADR) lands it.
 *   - concurrentAction: two members propose at the same head — exactly one lands, the other stale.
 *   - relandAction: the stale member re-runs the mirrors against the new head (merge-semantic, S25).
 */

const GRAPH: AuthorityGraph = {
	domain: "checkout",
	truthKind: "behaviour",
	approvers: ["product_owner", "security"],
	veto: ["legal"],
	escalation: ["architecture_board"],
};

function proposal(
	actor: string,
	head: string,
	granted: string[],
	label: string,
): Proposal {
	return {
		actor,
		domain: "checkout",
		truthKind: "behaviour",
		head,
		granted,
		label,
		spec: { kind: "add", target: "Order.discount" },
		mirror: { kind: "add", target: "Order.discount.mirror" },
	};
}

export async function gateAction(
	_prev: GateView,
	formData: FormData,
): Promise<GateView> {
	const mode = String(formData.get("mode") ?? "full"); // full | veto | partial
	const withOverride = formData.get("override") === "on";
	let granted: string[];
	if (mode === "veto") granted = ["product_owner", "security", "legal"];
	else if (mode === "partial") granted = ["product_owner"];
	else granted = ["product_owner", "security"];

	const override: OverrideRecord | undefined = withOverride
		? {
				by: "cto",
				reason: "incident hotfix — legal cleared verbally",
				adr: "ADR-0016",
			}
		: undefined;

	const decision = approve(
		GRAPH,
		proposal("alice", "head-0", granted, "add order discount"),
		"head-0",
		override,
	);
	return { ...GATE_INITIAL, ran: true, decision };
}

export async function concurrentAction(
	_prev: ConcurrencyView,
): Promise<ConcurrencyView> {
	const startHead = "head-0";
	const decisions = applyConcurrent(GRAPH, startHead, [
		proposal(
			"alice",
			startHead,
			["product_owner", "security"],
			"alice: order discount",
		),
		proposal(
			"bob",
			startHead,
			["product_owner", "security"],
			"bob: same order discount",
		),
	]);
	return {
		...CONCURRENCY_INITIAL,
		ran: true,
		decisions,
		appliedCount: appliedCount(decisions),
		stale: staleProposals(decisions),
		startHead,
	};
}

export async function relandAction(
	_prev: RelandView,
	formData: FormData,
): Promise<RelandView> {
	const newHead = String(formData.get("newHead") ?? "");
	if (newHead === "") return RELAND_INITIAL;
	// bob re-runs his mirrors against the moved head (merge-semantic decided the merge is clean) and
	// re-applies — now fresh, the write lands.
	const decision = approve(
		GRAPH,
		proposal("bob", newHead, ["product_owner", "security"], "bob re-applies"),
		newHead,
	);
	return { ...RELAND_INITIAL, ran: true, decision, newHead };
}
