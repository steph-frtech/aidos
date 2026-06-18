/**
 * deploy-data.ts — the DETERMINISTIC demo fixture + the Go `plan` tool ARGS for the /deploy panel
 * (S96 — the phase-keyed deploy pipeline), the *-data sibling of the twin lib/deploy.ts.
 *
 * ADR 0092 CUTOVER (le moteur Go est l'UNIQUE source vivante). The /deploy panel now reads the LIVE
 * DeployPlan from the Go `deploy` MCP server (tool `plan`) through the passerelle
 * (readVia(scope, "plan", planArgs, planDecoder, demoPlan)). The pure twin lib/deploy.buildPlan is
 * KEPT ONLY here, as the deterministic demo fallback (`demoPlan`) — never the live source. Isolating
 * the twin VALUE-import in this *-data sibling keeps the T5 cliquet (twin-as-live-fitness) GREEN:
 * actions.ts imports the demo from here (a `lib/<x>-data.ts` fixture, the recognised demo frontier)
 * AND the readVia frontier from gateway-sdk, so the twin compute sits BEHIND `source:"demo"`.
 *
 * DETERMINISM-FIRST (CLAUDE.md §6/§8): buildPlan is a PURE function — same (phase, surface, gate,
 * migration, manifest, env) → byte-identical plan. The args builder is pure too (a fixture, never
 * drawn). THE WALL (§2): a demo fixture writes no truth; the deploy READS (a below-the-line plan).
 */

import {
	buildPlan,
	type DeployInput,
	type DeployPlan,
	isBlocked,
	type MigrationStep,
	type OrderManifest,
} from "./deploy";

/** The default phase hash the /deploy panel plans against (a content-addressed stable phase). */
export const DEFAULT_PHASE_HASH = "phase-0123456789abcdef";

/** The canonical forward-only rename migration (expand → backfill → contract) — the demo's S95 lifecycle. */
export const RENAME_MIGRATION: MigrationStep[] = [
	{
		stage: "expand",
		sql: 'ALTER TABLE "order" ADD COLUMN "reference" text',
		note: "additive nullable column",
	},
	{
		stage: "backfill",
		sql: 'UPDATE "order" SET "reference" = "ref"',
		note: "recopie old→new, no row loses its value",
	},
	{
		stage: "contract",
		sql: 'ALTER TABLE "order" DROP COLUMN "ref"',
		note: "drop in a SEPARATE forward step, after backfill",
	},
];

/**
 * deployManifest — the per-app DP02 StackManifest the DP26 complete deploy order is computed over
 * (the minimal /data/dockers-convention stack). Its `app` equals the surface project (per-app, S96).
 * Deterministic — a fixture, never drawn. Supplying it opts the plan into the seven ordered stages.
 */
export function deployManifest(project: string): OrderManifest {
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

/** The inputs the /deploy form threads (the toggles + the project). A pure value object. */
export interface DeployRequest {
	project: string;
	phaseHash: string;
	/** deploy a NON-STABLE phase (a red mirror) — proves the PHASE_NOT_STABLE refusal. */
	unstable: boolean;
	/** carry a forward-only data migration (the rename lifecycle). */
	withMigration: boolean;
}

/**
 * deployInput — the PURE DeployInput the panel plans over (used both to build the Go `plan` args
 * and the demo plan). A stable phase by default; a red phase when `unstable`; the rename migration
 * when `withMigration`. Deterministic — same request → byte-identical input.
 */
export function deployInput(req: DeployRequest): DeployInput {
	const phase = req.unstable
		? {
				phaseHash: req.phaseHash,
				stable: false,
				reasons: ["createOrder.fixture"],
			}
		: { phaseHash: req.phaseHash, stable: true, reasons: [] };
	return {
		phase,
		gate: { mutationScore: 0.9, mutationThreshold: 0.8, monsterCount: 0 },
		surface: {
			project: req.project,
			serverBundleHash: `srv-${req.project}-001`,
			frontBundleHash: `frt-${req.project}-001`,
			infraHash: `inf-${req.project}-001`,
			datastoreHash: `dst-${req.project}-001`,
		},
		programPath: `gen/${req.project}/infra/index.ts`,
		programBytes: "export function program() {}\n",
		migration: req.withMigration ? RENAME_MIGRATION : [],
		manifest: deployManifest(req.project),
		env: "prod",
	};
}

/** The emitted Pulumi program text — re-emitted from the phase at deploy (a deterministic fixture). */
const PROGRAM_BYTES = "export function program() {}\n";

/**
 * programByteArray — the program text as a JSON ARRAY of byte values. The Go honoemit.Artifact.Bytes
 * is a `[]byte`, which the MCP jsonschema validates as `"null, array"` (NOT a base64 string) — so the
 * wire carries an array of numbers, never `""` (the S59 byte-array transport scar avoided). A NON-EMPTY
 * program is required (the Go validateSurface refuses an empty one with ErrNoProgram). Pure, total.
 */
function programByteArray(): number[] {
	const out: number[] = [];
	for (let i = 0; i < PROGRAM_BYTES.length; i++)
		out.push(PROGRAM_BYTES.charCodeAt(i));
	return out;
}

/**
 * planArgs — the Go `plan` tool arguments (planInput{ input: deploy.Input }). The Go Input carries a
 * phases.StablePhase (cut/sensor_status/stable/reasons — NO top-level id; the deploy URL is derived
 * from the cut's content address) + a datamigrate.Change + the emitted surface/program. The MCP
 * jsonschema is STRICT (additionalProperties:false, every field required), so we send EXACTLY its
 * fields, with the Artifact.bytes as a number ARRAY. The Go side is authoritative for the plan;
 * these args are a deterministic projection of the form's request.
 */
export function planArgs(req: DeployRequest): Record<string, unknown> {
	const input = deployInput(req);
	const reasons = req.unstable ? ["createOrder.fixture"] : [];
	return {
		input: {
			phase: {
				cut: {},
				sensor_status: req.unstable
					? [{ id: "createOrder.fixture", pass: false }]
					: [],
				stable: !req.unstable,
				reasons,
			},
			gate: {
				mutation_score: 0.9,
				mutation_threshold: 0.8,
				monster_count: 0,
			},
			surface: {
				project: req.project,
				server_bundle_hash: `srv-${req.project}-001`,
				front_bundle_hash: `frt-${req.project}-001`,
				infra_hash: `inf-${req.project}-001`,
				datastore_hash: `dst-${req.project}-001`,
			},
			program: {
				path: `gen/${req.project}/infra/index.ts`,
				target: "ts-pulumi",
				bytes: programByteArray(),
				source_hash: "",
				output_hash: "",
				protected: false,
			},
			change:
				input.migration && input.migration.length > 0
					? { project: req.project, kind: "rename" }
					: { project: req.project, kind: "" },
			domain_root: "",
		},
	};
}

/**
 * demoPlan — the deterministic demo DeployPlan the panel falls back to when the live read misses
 * (no endpoint / transport error / refused / malformed / a non-stable phase). PURE: the twin
 * buildPlan over the same input. Returns null when the phase is refused (the unstable toggle) — the
 * panel then surfaces the refusal from the live read or this null (a non-stable phase).
 */
export function demoPlan(req: DeployRequest): DeployPlan | null {
	const plan = buildPlan(deployInput(req));
	if (isBlocked(plan)) return null;
	return plan;
}
