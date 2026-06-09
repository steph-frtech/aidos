// Scenarios for the /account-release Workbench panel — DECLARED demo accounts (no live
// DB read here; the panel re-runs the SAME pure twin the Go package runs). Each scenario
// is a per-account inventory the twin assembles into an AccountReleasePack. They are
// illustrative fixtures, honestly labelled; the real panel reads the account's live
// truth-store when wired (fitness, SELECT-only).

import type { AccountView } from "./account-release";

export interface AccountScenario {
	id: string;
	labelKey: string;
	view: AccountView;
}

export const ACCOUNT_SCENARIOS: AccountScenario[] = [
	{
		id: "starter",
		labelKey: "scenarioStarter",
		view: {
			account: "acme",
			projects: [
				{
					id: "p-shop",
					name: "Boutique",
					status: "real",
					kernelHead: "kh-shop",
				},
				{
					id: "p-demo",
					name: "Démo checkout",
					status: "demo",
					kernelHead: "kh-demo",
				},
			],
			cliSurface: [
				{ name: "check" },
				{ name: "goal" },
				{ name: "grill" },
				{ name: "init" },
			],
			workbenchRoutes: [
				{ path: "/account-release" },
				{ path: "/cli" },
				{ path: "/adoption" },
			],
			docs: [
				{ slug: "guide/intro", title: "Démarrer avec AIDOS" },
				{
					slug: "steps/internals/s117-cli-release",
					title: "S117 — surface CLI + release",
				},
			],
			mirrors: [
				{ id: "m-cli", testKind: "property" },
				{ id: "m-release", testKind: "fixture" },
			],
			changesets: [{ ref: "cs-1", summary: "phase initiale" }],
			declaredLimits: [
				{
					ref: "lim-doltgres",
					description:
						"Doltgres beta — fallback Postgres si le spike échoue (ADR 0006).",
				},
				{
					ref: "lim-async",
					description:
						"Les opérations async sont best-effort (exactly-once relatif, S73).",
				},
			],
			capabilities: ["tests", "mutation", "one_krd_cell"],
		},
	},
	{
		id: "kernel",
		labelKey: "scenarioKernel",
		view: {
			account: "globex",
			projects: [
				{
					id: "p-erp",
					name: "ERP interne",
					status: "real",
					kernelHead: "kh-erp",
				},
			],
			cliSurface: [{ name: "check" }, { name: "goal" }, { name: "diff" }],
			workbenchRoutes: [{ path: "/account-release" }, { path: "/kernel" }],
			docs: [{ slug: "concepts/kernel", title: "Le noyau" }],
			mirrors: [
				{ id: "m-a", testKind: "journey" },
				{ id: "m-b", testKind: "property" },
				{ id: "m-c", testKind: "fixture" },
			],
			changesets: [
				{ ref: "cs-1", summary: "kernel initial" },
				{ ref: "cs-2", summary: "ajout entité commande" },
			],
			declaredLimits: [
				{
					ref: "lim-plan",
					description:
						"Quota du plan : 4 projets max — passez au plan supérieur pour plus (S114).",
				},
			],
			// kernel + mirror live, but NO RealityMirror → blocked entering T2.
			capabilities: ["tests", "mutation", "one_krd_cell", "kernel", "mirror"],
		},
	},
	{
		id: "empty",
		labelKey: "scenarioEmpty",
		view: {
			account: "newco",
			projects: [],
			cliSurface: [],
			workbenchRoutes: [],
			docs: [],
			mirrors: [],
			changesets: [],
			declaredLimits: [],
			capabilities: [],
		},
	},
];
