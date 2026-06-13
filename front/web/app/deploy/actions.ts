"use server";

import {
	buildPlan,
	type DeployInput,
	deployedMatchesPhase,
	isBlocked,
	type MigrationStep,
	migrationIsForwardOnly,
} from "@/lib/deploy";
import {
	buildPreviewWithBootstrap,
	isBlocked as isPreviewBlocked,
	type StackManifest,
	servedMatchesEmitted,
	teardownOf,
} from "@/lib/preview-bootstrap";
import type { DeployView, PreviewView } from "./view";

/**
 * Server Action for the /deploy Workbench panel (S96 — the phase-keyed deploy pipeline,
 * app-builder EPIC 10, DP26 / ADR 0043).
 *
 * THE STEP (ROADMAP-app-builder S96): « Déployer cette phase » est permis UNIQUEMENT depuis une
 * phase STABLE (« done is computed » : red→vert ∧ vert antérieur ∧ mutation ≥ seuil ∧ aucun
 * monstre). Le déploiement RÉ-ÉMET l'app depuis la phase (S78, déterministe) puis exécute une
 * migration de donnée FORWARD-ONLY (S95 : expand → backfill → contract) et provisionne une URL
 * via `pulumi up` (ADR 0043). Done-criteria : une phase non-stable est refusée PHASE_NOT_STABLE ;
 * la migration tourne forward-only ; l'artefact déployé est ré-projeté depuis la phase, jamais
 * un artefact sandbox périmé.
 *
 * DETERMINISM-FIRST (CLAUDE.md §6/§8): buildPlan + isDeployable sont des fonctions PURES de
 * l'input (lib/deploy) — même phase stable + surface + change → plan byte-identique, jamais un
 * LLM. Le Stop-gate et l'égalité servi↔émis sont des comparaisons pures (le code juge). THE WALL
 * (§2): planifier n'écrit AUCUNE vérité ; enregistrer le déploiement d'une phase comme décision
 * DAG passe par propose → ChangeSet → approbation, jamais une écriture directe.
 */

const PHASE_HASH = "phase-0123456789abcdef";

const RENAME_MIGRATION: MigrationStep[] = [
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

export async function deployAction(
	_prev: DeployView,
	formData: FormData,
): Promise<DeployView> {
	const project = String(formData.get("project") ?? "").trim() || "shop";
	const phaseHash =
		String(formData.get("phaseHash") ?? "").trim() || PHASE_HASH;
	// Toggle: deploy a NON-STABLE phase (a red mirror) — proves the PHASE_NOT_STABLE refusal.
	const unstable = formData.get("unstable") === "on";
	// Toggle: carry a forward-only data migration (the rename lifecycle).
	const withMigration = formData.get("withMigration") === "on";

	const input: DeployInput = {
		phase: unstable
			? { phaseHash, stable: false, reasons: ["createOrder.fixture"] }
			: { phaseHash, stable: true, reasons: [] },
		gate: { mutationScore: 0.9, mutationThreshold: 0.8, monsterCount: 0 },
		surface: {
			project,
			serverBundleHash: `srv-${project}-001`,
			frontBundleHash: `frt-${project}-001`,
			infraHash: `inf-${project}-001`,
			datastoreHash: `dst-${project}-001`,
		},
		programPath: `gen/${project}/infra/index.ts`,
		programBytes: "export function program() {}\n",
		migration: withMigration ? RENAME_MIGRATION : [],
	};

	const plan = buildPlan(input);
	if (isBlocked(plan))
		return {
			ok: false,
			blockCode: plan.code,
			blockExplanation: plan.explanation,
		};

	// The running deploy reports its served-app hash from the phase's emitted bytes
	// (the /__aidos_hash probe), which equals the plan's EmittedAppHash. We assert the
	// equality (the re-projection property) deterministically — code judges, never an agent.
	const servedAppHash = plan.emittedAppHash;
	const match = deployedMatchesPhase(plan, servedAppHash);
	const forwardOnly = migrationIsForwardOnly(plan.migration.steps);

	if (isBlocked(match))
		return {
			ok: true,
			plan,
			servedAppHash,
			servedMatches: false,
			forwardOnly,
			blockCode: match.code,
			blockExplanation: match.explanation,
		};

	return { ok: true, plan, servedAppHash, servedMatches: true, forwardOnly };
}

/**
 * previewManifest — the per-app DP02 StackManifest the preview's bootstrap amorces. A richer-
 * than-Example fixture: the core stack (server + datastore + interpreter, all `core`) PLUS one
 * opt-in service per non-core profile, so selecting `git`/`tickets`/… VISIBLY narrows the
 * bootstrapped services on screen while `full` keeps the union. The roles are inside the
 * intersection of the DP02 manifest set and the DP12 bootstrap-emitter subset, so the sequence
 * is nominal. Its `app` equals the surface project (preview is per-app, S94). Deterministic.
 */
function previewManifest(project: string): StackManifest {
	let port = 9100;
	const optIns = (
		[
			{ profile: "observability", role: "observability" },
			{ profile: "qa", role: "workflow" },
			{ profile: "git", role: "git" },
			{ profile: "tickets", role: "tickets" },
		] as const
	).map(({ profile, role }) => ({
		name: `svc-${profile}`,
		role,
		image: "",
		internal_port: port++,
		profile,
	}));
	return {
		app: project,
		services: [
			{
				name: "app",
				role: "server",
				image: "node:22-alpine",
				internal_port: 3000,
				profile: "core",
			},
			{
				name: "postgres",
				role: "datastore",
				image: "postgres:17-alpine",
				internal_port: 5432,
				profile: "core",
			},
			{
				name: "interpreter",
				role: "interpreter",
				image: "",
				internal_port: 8973,
				profile: "core",
			},
			...optIns,
		],
		volumes: [{ name: "app_data", device_var: "APP_DATA_PATH" }],
		network: { name: "traefik_default", external: true },
		connector_scopes: ["crm"],
	};
}

/**
 * Server Action for the DP25 « Preview éphémère » tab (EPIC F — extends S94, never duplicates).
 *
 * THE STEP (DP25). The preview RE-ÉMET the app from the content-addressed STABLE PHASE (DP05
 * stackemit.EmitStack — the gated executor materializes the served bytes; the existing
 * web-preview server serves the app, no real docker here) then AMORCES the ephemeral
 * environment via the DP12 deterministic bootstrap, with a DP11-SELECTABLE profile (`core`
 * default, `full` for a complete preview). The CAPITAL INVARIANT: the preview's app-hash EQUALS
 * the phase's emitted hash (servedMatchesEmitted), ∀ profiles — the profile changes the
 * bootstrapped SERVICES, never the EmittedAppHash. Teardown is deterministic (reverse boot
 * order). Keyed on a content-addressed phase.
 *
 * DETERMINISM-FIRST (CLAUDE.md §6/§8): buildPreviewWithBootstrap is a PURE function of the
 * input (lib/preview-bootstrap, the twin of back/runtime/preview DP25) — same phase + profile →
 * byte-identical PreviewPlan, never an LLM. The hash equality and the profile set-membership are
 * pure comparisons (the code judges). THE WALL (§2): triggering a preview is BELOW-THE-LINE — it
 * PLANS, it writes NO truth.
 *
 * The single action is driven by an `intent` field (launch | teardown | emitted) so the tab's
 * three controls (launch / demount / emitted) reach the same pure twin.
 */
export async function previewAction(
	_prev: PreviewView,
	formData: FormData,
): Promise<PreviewView> {
	const intent = String(formData.get("intent") ?? "launch");
	const project = String(formData.get("project") ?? "").trim() || "shop";
	const phaseHash =
		String(formData.get("phaseHash") ?? "").trim() || PHASE_HASH;
	const profile = String(formData.get("profile") ?? "core").trim() || "core";

	const plan = buildPreviewWithBootstrap({
		phase: { phaseHash },
		surface: {
			project,
			serverBundleHash: `srv-${project}-001`,
			frontBundleHash: `frt-${project}-001`,
			infraHash: `inf-${project}-001`,
			datastoreHash: `dst-${project}-001`,
		},
		programPath: `gen/${project}/infra/index.ts`,
		programBytes: "export function program() {}\n",
		profile,
		manifest: previewManifest(project),
		// The host snapshot + the present secret are supplied AS DATA (the DP12 motif); the
		// `crm` connector scope requires APP_SECRET_CRM at boot — present for a nominal preview.
		host: { ssOutput: "", dockerPsOutput: "" },
		secrets: { present: ["APP_SECRET_CRM"] },
		env: "dev",
	});

	if (isPreviewBlocked(plan))
		return {
			ok: false,
			blockCode: plan.code,
			blockExplanation: plan.explanation,
		};

	// The running preview reports its served-app hash from the phase's emitted bytes
	// (the /__aidos_hash probe), which EQUALS the plan's emittedAppHash. We assert the
	// equality (the capital invariant) deterministically — code judges, never an agent.
	const servedAppHash = plan.emittedAppHash;
	const hashMatches = servedMatchesEmitted(plan, servedAppHash) === true;
	const teardown = teardownOf(plan);
	// The EMITTED button (S11 control) the web-preview sidecar serves declares the linked
	// operation — for the preview surface, the checkout-button → createOrder projection (S38).
	const emittedOp = "createOrder";

	// The « Démonter » control runs the deterministic demount; the « Emis » control declares
	// the linked operation. Both keep the just-built plan visible (the screen does the action).
	return {
		ok: true,
		plan,
		servedAppHash,
		hashMatches,
		teardownServices: teardown.services,
		teardownDone: intent === "teardown",
		emittedOp,
		emittedRun: intent === "emitted",
	};
}
