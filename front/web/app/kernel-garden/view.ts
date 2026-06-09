import type {
	Garden,
	GardenTrimPlan,
	OpenIdea,
	ProjectSnapshot,
} from "@/lib/kernel-garden";

/**
 * View-model + scenarios for the /kernel-garden cockpit (S112 — per-project KernelDebt
 * gardening + /trim, KRD §82.4). The panel selects a project, runs the pure twin
 * (lib/kernel-garden) to TEND its debt, SUGGEST a trim plan, and ACCEPT a proposal
 * (which opens an idea — never deletes). THE WALL (§2): the cockpit WRITES NOTHING.
 */

// Two demo projects, each with its OWN debt — proving the §82.4 project scoping (a scan
// of proj-checkout never surfaces proj-billing's debt). Each carries all five rots so
// the panel demonstrates the full ledger.
export const PROJECTS: Record<string, ProjectSnapshot> = {
	"proj-checkout": {
		projectRef: "proj-checkout",
		kernelHead: "head-checkout-7",
		truths: [
			{ id: "Order.total", version: "v3", live: true },
			{ id: "Order.discount", version: "v1", live: true },
			{ id: "Order.tax", version: "v2", live: true },
		],
		mirrors: [
			// orphan: reflects a truth that no longer exists at all.
			{
				id: "mir-legacy",
				reflects: { layerId: "Order.legacyShipping", version: "v1" },
				testKind: "property",
				liveness: "alive",
			},
			// stale fixture: pinned to v1 while the live head is v3.
			{
				id: "fix-total",
				reflects: { layerId: "Order.total", version: "v1" },
				testKind: "fixture",
				liveness: "alive",
			},
			// dead liveness: a dead proof still pinned to a LIVE truth.
			{
				id: "mir-discount",
				reflects: { layerId: "Order.discount", version: "v1" },
				testKind: "property",
				liveness: "dead",
			},
			// healthy mirror covering Order.tax (so the surviving mutant is detected).
			{
				id: "mir-tax",
				reflects: { layerId: "Order.tax", version: "v2" },
				testKind: "property",
				liveness: "alive",
			},
		],
		mutation: [{ target: "Order.tax", status: "survived" }],
		budgets: [
			// low-value constraint: 5000 tokens metered against a 1000 cap, no ValueCase.
			{
				cellRef: "checkout.audit-trail",
				maxLlmTokensPerGoal: 1000,
				expectedRiskReduction: "low",
				cost: { llmTokens: 5000 },
				valueCase: null,
			},
		],
	},
	"proj-billing": {
		projectRef: "proj-billing",
		kernelHead: "head-billing-3",
		truths: [{ id: "Invoice.amount", version: "v1", live: true }],
		mirrors: [
			{
				id: "mir-billing-dead",
				reflects: { layerId: "Invoice.amount", version: "v1" },
				testKind: "property",
				liveness: "dead",
			},
		],
		mutation: [],
		// a JUSTIFIED costly constraint — NOT debt (it earned its keep, §66.3).
		budgets: [
			{
				cellRef: "billing.tax-engine",
				maxLlmTokensPerGoal: 1000,
				expectedRiskReduction: "high",
				cost: { llmTokens: 9000 },
				valueCase: {
					truth: "billing.tax-engine",
					riskIfBroken: "critical",
					expectedImpact:
						"un calcul de taxe faux facture mal le client — coût élevé justifié",
					harnessCost: {},
					decision: "justified",
				},
			},
		],
	},
};

export const PROJECT_REFS = Object.keys(PROJECTS);
export const DEFAULT_PROJECT = "proj-checkout";

export interface GardenView {
	ran: boolean;
	garden: Garden | null;
	plan: GardenTrimPlan | null;
}

export const GARDEN_INITIAL: GardenView = {
	ran: false,
	garden: null,
	plan: null,
};

export interface AcceptView {
	ran: boolean;
	openIdea: OpenIdea | null;
}

export const ACCEPT_INITIAL: AcceptView = { ran: false, openIdea: null };
