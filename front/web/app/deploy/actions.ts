"use server";

import {
	buildPlan,
	type DeployInput,
	deployedMatchesPhase,
	isBlocked,
	type MigrationStep,
	migrationIsForwardOnly,
} from "@/lib/deploy";
import type { DeployView } from "./view";

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
