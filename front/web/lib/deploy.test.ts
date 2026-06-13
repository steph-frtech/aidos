/**
 * The S96 phase-keyed DEPLOY twin reproducibility mirror (fast-check — the frozen front
 * property slot). It pins the same done-criteria as the Go rapid mirror:
 *   1. reproducibility — same input → byte-identical plan (id + URL + migration id);
 *   2. re-projection — the deployed app hash EQUALS the phase emitted app hash; the served
 *      check accepts exactly that hash and rejects every other (no stale sandbox artifact);
 *   3. the Stop-gate — a non-stable phase (red mirror ∨ mutation < threshold ∨ a monster) is
 *      ALWAYS refused PHASE_NOT_STABLE, never a plan;
 *   4. content-address sensitivity — a different phase/surface → a different deploy id + URL;
 *   5. forward-only — every accepted plan's migration is expand → backfill → contract;
 *   6. malformed surface refusal — a missing server bundle / cross-project program is refused.
 * Same input → same output, on every run.
 */
import fc from "fast-check";
import { describe, expect, it } from "vitest";
import {
	buildPlan,
	type DeployInput,
	type DeployPlan,
	deployedMatchesPhase,
	emittedAppHash,
	isBlocked,
	type MigrationStep,
	migrationIsForwardOnly,
	ORDERED_DEPLOY_STAGES,
	type OrderManifest,
} from "./deploy";

const validMigration: MigrationStep[] = [
	{ stage: "expand", sql: "ADD COLUMN reference text", note: "additive" },
	{
		stage: "backfill",
		sql: "UPDATE order SET reference = ref",
		note: "recopie",
	},
	{ stage: "contract", sql: "DROP COLUMN ref", note: "after backfill" },
];

function stableInput(phaseHash: string, project: string): DeployInput {
	return {
		phase: { phaseHash, stable: true, reasons: [] },
		gate: { mutationScore: 0.9, mutationThreshold: 0.8, monsterCount: 0 },
		surface: {
			project,
			serverBundleHash: `srv-${project}`,
			frontBundleHash: `fnt-${project}`,
			infraHash: `inf-${project}`,
			datastoreHash: `dat-${project}`,
		},
		programPath: `gen/${project}/infra/index.ts`,
		programBytes: "// pulumi",
		migration: validMigration,
	};
}

const genHash = fc.stringMatching(/^[a-z0-9]{8,16}$/);
const genProject = fc.constantFrom("shop", "blog", "crm");

describe("S96 deploy twin", () => {
	it("1. reproducibility — same input → byte-identical plan", () => {
		fc.assert(
			fc.property(genHash, genProject, (h, p) => {
				const a = buildPlan(stableInput(h, p));
				const b = buildPlan(stableInput(h, p));
				expect(isBlocked(a)).toBe(false);
				expect(isBlocked(b)).toBe(false);
				expect(a).toEqual(b);
			}),
		);
	});

	it("2. re-projection — deployed hash = phase emitted hash; served check is exact", () => {
		fc.assert(
			fc.property(genHash, genProject, (h, p) => {
				const plan = buildPlan(stableInput(h, p)) as DeployPlan;
				expect(isBlocked(plan)).toBe(false);
				const want = emittedAppHash(h, stableInput(h, p).surface);
				expect(plan.emittedAppHash).toBe(want);
				expect(deployedMatchesPhase(plan, want)).toBe(true);
				// any other served hash is a stale artifact → refused.
				expect(deployedMatchesPhase(plan, `${want}x`)).not.toBe(true);
			}),
		);
	});

	it("3. Stop-gate — a non-stable phase is ALWAYS refused PHASE_NOT_STABLE", () => {
		fc.assert(
			fc.property(
				genHash,
				genProject,
				fc.integer({ min: 0, max: 2 }),
				(h, p, defect) => {
					const input = stableInput(h, p);
					if (defect === 0) {
						input.phase = {
							phaseHash: h,
							stable: false,
							reasons: ["x.fixture"],
						};
					} else if (defect === 1) {
						input.gate = {
							mutationScore: 0.3,
							mutationThreshold: 0.8,
							monsterCount: 0,
						};
					} else {
						input.gate = {
							mutationScore: 0.9,
							mutationThreshold: 0.8,
							monsterCount: 1,
						};
					}
					const out = buildPlan(input);
					expect(isBlocked(out)).toBe(true);
					if (isBlocked(out)) expect(out.code).toBe("PHASE_NOT_STABLE");
				},
			),
		);
	});

	it("4. content-address sensitivity — different phase/surface → different id + URL", () => {
		fc.assert(
			fc.property(genHash, genHash, genProject, (h1, h2, p) => {
				fc.pre(h1 !== h2);
				const a = buildPlan(stableInput(h1, p)) as DeployPlan;
				const b = buildPlan(stableInput(h2, p)) as DeployPlan;
				expect(a.id).not.toBe(b.id);
				expect(a.url).not.toBe(b.url);
			}),
		);
	});

	it("5. forward-only — every accepted plan's migration is expand→backfill→contract", () => {
		fc.assert(
			fc.property(genHash, genProject, (h, p) => {
				const plan = buildPlan(stableInput(h, p)) as DeployPlan;
				expect(isBlocked(plan)).toBe(false);
				expect(migrationIsForwardOnly(plan.migration.steps)).toBe(true);
				expect(plan.migration.preservesAllData).toBe(true);
			}),
		);
	});

	it("6. malformed surface — missing server bundle / cross-project program refused", () => {
		fc.assert(
			fc.property(genHash, genProject, fc.boolean(), (h, p, kind) => {
				const input = stableInput(h, p);
				if (kind) input.surface.serverBundleHash = "";
				else input.programPath = "gen/other/infra/index.ts";
				const out = buildPlan(input);
				expect(isBlocked(out)).toBe(true);
				if (isBlocked(out)) expect(out.code).toBe("OUT_OF_SCOPE");
			}),
		);
	});
});

/* ---------------------------------------------------------------------------------------------
 * DP26 — the COMPLETE deploy ORDER (EPIC F, extends S96). The order is OPT-IN: an input with no
 * manifest is EXACTLY the S96 plan (no order). Supplying a manifest opts into the seven ordered
 * stages (network → volumes → datastore-provision → migration → bootstrap → healthcheck → URL).
 * The order NEVER alters the emittedAppHash/url/stackName; same phase → byte-identical order.
 * ------------------------------------------------------------------------------------------- */

function orderManifest(project: string): OrderManifest {
	return {
		app: project,
		services: [
			{ name: "app", role: "server" },
			{ name: "postgres", role: "datastore" },
			{ name: "interpreter", role: "interpreter" },
		],
		volumes: [{ name: "app_data", device_var: "APP_DATA_PATH" }],
		network: { name: "traefik_default", external: true },
		connector_scopes: ["crm"],
	};
}

describe("DP26 deploy ORDER twin", () => {
	it("opt-in additive — no manifest ⇒ the exact S96 plan (no order field)", () => {
		fc.assert(
			fc.property(genHash, genProject, (h, p) => {
				const plan = buildPlan(stableInput(h, p)) as DeployPlan;
				expect(isBlocked(plan)).toBe(false);
				expect(plan.order).toBeUndefined();
			}),
		);
	});

	it("ordered — the seven stages appear in the canonical network→…→url order", () => {
		fc.assert(
			fc.property(genHash, genProject, (h, p) => {
				const input = { ...stableInput(h, p), manifest: orderManifest(p) };
				const plan = buildPlan(input) as DeployPlan;
				expect(isBlocked(plan)).toBe(false);
				expect(plan.order).toBeDefined();
				const kinds = (plan.order?.stages ?? []).map((s) => s.kind);
				expect(kinds).toEqual([...ORDERED_DEPLOY_STAGES]);
				// 1-based seq is dense and ordered.
				(plan.order?.stages ?? []).forEach((s, i) => {
					expect(s.seq).toBe(i + 1);
				});
			}),
		);
	});

	it("re-projection preserved — the order NEVER alters the emitted app hash / url / stack", () => {
		fc.assert(
			fc.property(genHash, genProject, (h, p) => {
				const base = buildPlan(stableInput(h, p)) as DeployPlan;
				const withOrder = buildPlan({
					...stableInput(h, p),
					manifest: orderManifest(p),
				}) as DeployPlan;
				// the deployed artifact is the phase's app, ∀ order.
				expect(withOrder.emittedAppHash).toBe(base.emittedAppHash);
				expect(withOrder.url).toBe(base.url);
				expect(withOrder.stackName).toBe(base.stackName);
				// the order folds into the deploy id — a different shape → a different id.
				expect(withOrder.id).not.toBe(base.id);
				// the re-projection still holds against the unchanged emitted hash.
				expect(deployedMatchesPhase(withOrder, withOrder.emittedAppHash)).toBe(
					true,
				);
			}),
		);
	});

	it("reproducible — same phase ⇒ byte-identical order (same order hash)", () => {
		fc.assert(
			fc.property(genHash, genProject, (h, p) => {
				const a = buildPlan({
					...stableInput(h, p),
					manifest: orderManifest(p),
				}) as DeployPlan;
				const b = buildPlan({
					...stableInput(h, p),
					manifest: orderManifest(p),
				}) as DeployPlan;
				expect(a.order).toEqual(b.order);
				expect(a.order?.hash).toBe(b.order?.hash);
			}),
		);
	});

	it("Stop-gate still first — a non-stable phase with a manifest is refused PHASE_NOT_STABLE", () => {
		fc.assert(
			fc.property(genHash, genProject, (h, p) => {
				const out = buildPlan({
					...stableInput(h, p),
					phase: { phaseHash: h, stable: false, reasons: ["x.fixture"] },
					manifest: orderManifest(p),
				});
				expect(isBlocked(out)).toBe(true);
				if (isBlocked(out)) expect(out.code).toBe("PHASE_NOT_STABLE");
			}),
		);
	});

	it("per-app — a manifest for another app is refused OUT_OF_SCOPE (cross-app order)", () => {
		fc.assert(
			fc.property(genHash, genProject, (h, p) => {
				const out = buildPlan({
					...stableInput(h, p),
					manifest: orderManifest("someOtherApp"),
				});
				expect(isBlocked(out)).toBe(true);
				if (isBlocked(out)) expect(out.code).toBe("OUT_OF_SCOPE");
			}),
		);
	});

	it("datastore stage — prod omits doltgres, non-prod includes it (the DP06 gate delegated)", () => {
		const prod = buildPlan({
			...stableInput("aaaaaaaa", "shop"),
			manifest: orderManifest("shop"),
			env: "prod",
		}) as DeployPlan;
		const dev = buildPlan({
			...stableInput("aaaaaaaa", "shop"),
			manifest: orderManifest("shop"),
			env: "dev",
		}) as DeployPlan;
		const prodDS = prod.order?.stages.find(
			(s) => s.kind === "datastore-provision",
		)?.detail;
		const devDS = dev.order?.stages.find(
			(s) => s.kind === "datastore-provision",
		)?.detail;
		expect(prodDS).not.toContain("doltgres");
		expect(devDS).toContain("doltgres");
	});
});
