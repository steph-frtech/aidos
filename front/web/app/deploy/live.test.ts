import { describe, expect, it } from "vitest";
import type { DeployPlan } from "../../lib/deploy";
import { type DeployRequest, demoPlan, planArgs } from "../../lib/deploy-data";
import { lookup } from "../../lib/gateway";
import { planDecoder } from "./live";

/**
 * /deploy lecture live — le MIROIR DE PARITÉ (Vitest, le slot N1 front gelé ; lot kill-twins ADR
 * 0092, le flip du twin lib/deploy vers le moteur Go `deploy`).
 *
 * Il prouve que `planDecoder` décode l'ENVELOPPE planOutput du tool Go `plan` (back/mcp/deploy/
 * deploysrv — { ok, plan?, block? } où deploy.DeployPlan est SNAKE_CASE : emitted_app_hash,
 * phase_hash, stack_name, program_path, has_migration, migration{steps, preserves_all_data},
 * order{stages, stack_bundle_hash, bootstrap_hash, hash}) et RECONSTRUIT EXACTEMENT le DeployPlan
 * camelCase que le twin lib/deploy.buildPlan produit pour la MÊME requête — c'est le CONTRAT du
 * tool, PAS une seconde implémentation du calcul (deploy.BuildPlan est autoritatif). Le test pinne
 * la PARITÉ live==demo, le repli (ok:false / plan absent / malformé → null) et la dispatchabilité
 * front (lookup("plan") → { server:"deploy" }).
 *
 * DÉTERMINISME-FIRST (§6/§8) : même JSON → même verdict, zéro LLM. LE MUR (§2) : lecture sous la
 * ligne — aucune écriture.
 */

/**
 * goPlanOutputFromTwin fabrique l'enveloppe Go `plan` (planOutput, snake_case) à partir d'un
 * DeployPlan camelCase du twin — l'image EXACTE que deploysrv.planTool renverrait pour cette
 * requête. On la fabrique ICI dans le test (pas dans le code de prod) pour pouvoir l'opposer au
 * twin via le décodeur (le décodeur doit reconstruire le twin byte-pour-byte).
 */
function goPlanOutputFromTwin(plan: DeployPlan): unknown {
	return {
		ok: true,
		plan: {
			id: plan.id,
			project: plan.project,
			phase_hash: plan.phaseHash,
			emitted_app_hash: plan.emittedAppHash,
			url: plan.url,
			subdomain: plan.subdomain,
			stack_name: plan.stackName,
			program_path: plan.programPath,
			migration: {
				id: plan.migration.id,
				steps: plan.migration.steps.map((s) => ({
					stage: s.stage,
					sql: s.sql,
					note: s.note,
				})),
				preserves_all_data: plan.migration.preservesAllData,
			},
			has_migration: plan.hasMigration,
			boot: plan.boot,
			teardown: plan.teardown,
			...(plan.order
				? {
						order: {
							stages: plan.order.stages.map((st) => ({
								seq: st.seq,
								kind: st.kind,
								detail: st.detail,
							})),
							stack_bundle_hash: plan.order.stack_bundle_hash,
							bootstrap_hash: plan.order.bootstrap_hash,
							hash: plan.order.hash,
						},
					}
				: {}),
		},
	};
}

const STABLE_REQ: DeployRequest = {
	project: "shop",
	phaseHash: "phase-0123456789abcdef",
	unstable: false,
	withMigration: true,
};

describe("deploy live — `plan` decoder parity (Go == twin)", () => {
	it("reconstructs the EXACT twin DeployPlan from a Go-sample (stable + migration + order)", () => {
		const twin = demoPlan(STABLE_REQ);
		expect(twin).not.toBeNull();
		if (twin === null) return;
		const sample = goPlanOutputFromTwin(twin);
		// PARITÉ live==demo : le plan décodé == le plan-démo du twin (mêmes hashes, URL, ordre, migration).
		expect(planDecoder(sample)).toEqual(twin);
	});

	it("reconstructs the twin DeployPlan WITHOUT a migration (no schema change)", () => {
		const req: DeployRequest = { ...STABLE_REQ, withMigration: false };
		const twin = demoPlan(req);
		expect(twin).not.toBeNull();
		if (twin === null) return;
		const decoded = planDecoder(goPlanOutputFromTwin(twin));
		expect(decoded).toEqual(twin);
		expect(decoded?.hasMigration).toBe(false);
		expect(decoded?.migration.steps.length).toBe(0);
	});

	it("decodes the DP26 complete order (seven ordered stages, content-addressed)", () => {
		const twin = demoPlan(STABLE_REQ);
		if (twin === null) return;
		const decoded = planDecoder(goPlanOutputFromTwin(twin));
		expect(decoded?.order).toBeDefined();
		expect(decoded?.order?.stages.length).toBe(7);
		expect(decoded?.order?.stages.map((s) => s.kind)).toEqual([
			"network",
			"volumes",
			"datastore-provision",
			"migration",
			"bootstrap",
			"healthcheck",
			"url",
		]);
	});

	it("returns null when the Go plan is REFUSED (ok:false → demo fallback)", () => {
		// A non-stable phase: deploysrv.planTool returns { ok:false, block }. The decoder rejects it
		// → readVia falls back to the (null) demo plan, and the action surfaces PHASE_NOT_STABLE.
		expect(
			planDecoder({ ok: false, block: { code: "PHASE_NOT_STABLE" } }),
		).toBeNull();
		// the demo plan for a non-stable request is ALSO null (the twin refuses).
		expect(demoPlan({ ...STABLE_REQ, unstable: true })).toBeNull();
	});

	it("rejects a malformed payload (→ demo fallback)", () => {
		expect(planDecoder(null)).toBeNull();
		expect(planDecoder({})).toBeNull();
		expect(planDecoder({ ok: true })).toBeNull(); // no plan
		expect(planDecoder({ ok: true, plan: "nope" })).toBeNull();
		// a plan missing emitted_app_hash is malformed.
		expect(
			planDecoder({
				ok: true,
				plan: {
					id: "x",
					project: "shop",
					phase_hash: "p",
					url: "https://d.example",
					subdomain: "d-p",
					stack_name: "deploy-shop-d-p",
					program_path: "gen/shop/infra/index.ts",
					migration: { id: "", steps: [], preserves_all_data: true },
					has_migration: false,
					boot: [],
					teardown: [],
				},
			}),
		).toBeNull();
		// a migration with a non-boolean preserves_all_data is malformed.
		expect(
			planDecoder({
				ok: true,
				plan: {
					id: "x",
					project: "shop",
					phase_hash: "p",
					emitted_app_hash: "h",
					url: "https://d.example",
					subdomain: "d-p",
					stack_name: "s",
					program_path: "gen/shop/infra/index.ts",
					migration: { id: "", steps: [], preserves_all_data: "yes" },
					has_migration: false,
					boot: [],
					teardown: [],
				},
			}),
		).toBeNull();
	});

	it("planArgs projects the request into the Go `plan` input (phases.StablePhase, bytes as ARRAY)", () => {
		const args = planArgs(STABLE_REQ) as { input: Record<string, unknown> };
		expect(args.input).toBeDefined();
		const input = args.input as {
			phase: { cut: object; stable: boolean; reasons: string[] };
			surface: { project: string };
			program: { path: string; bytes: number[] };
		};
		// The Go deploy.Input.Phase is a phases.StablePhase (cut/sensor_status/stable/reasons —
		// NO top-level id, additionalProperties:false). A stable request → stable:true, no reasons.
		expect(input.phase.cut).toEqual({});
		expect(input.phase.stable).toBe(true);
		expect(input.phase.reasons).toEqual([]);
		expect(input.surface.project).toBe("shop");
		expect(input.program.path).toBe("gen/shop/infra/index.ts");
		// The Artifact.bytes []byte serialises as a JSON ARRAY of numbers (want "null, array"),
		// NEVER a base64 string — the S59 byte-array transport discipline. Non-empty (validateSurface).
		expect(Array.isArray(input.program.bytes)).toBe(true);
		expect(input.program.bytes.length).toBeGreaterThan(0);
		for (const b of input.program.bytes) expect(typeof b).toBe("number");
		// the whole args object is JSON-serialisable scalars (no json.RawMessage surface).
		expect(() => JSON.stringify(args)).not.toThrow();
	});

	it("planArgs of a NON-STABLE request carries a red sensor + stable:false (the PHASE_NOT_STABLE path)", () => {
		const args = planArgs({ ...STABLE_REQ, unstable: true }) as {
			input: {
				phase: {
					stable: boolean;
					sensor_status: { pass: boolean }[];
					reasons: string[];
				};
			};
		};
		expect(args.input.phase.stable).toBe(false);
		expect(args.input.phase.reasons).toContain("createOrder.fixture");
		expect(args.input.phase.sensor_status.some((s) => s.pass === false)).toBe(
			true,
		);
	});

	it("the front registry dispatches `plan` to the `deploy` server (anti-creux)", () => {
		const t = lookup("plan");
		expect(t).toBeDefined();
		expect(t?.server).toBe("deploy");
		expect(t?.disposition).toBe("below_line");
	});
});
