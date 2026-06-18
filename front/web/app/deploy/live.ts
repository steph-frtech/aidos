import type {
	DeployOrder,
	DeployPlan,
	DeployStage,
	DeployStageKind,
	MigrationPlan,
	MigrationStep,
} from "../../lib/deploy";
import {
	arr,
	type Decoded,
	type Decoder,
	isObject,
	num,
	str,
} from "../../lib/gateway-sdk";

/**
 * /deploy live read — le DÉCODEUR PUR sur la sortie de l'outil Go `plan` (cutover ADR 0092 : le
 * moteur Go `deploy` est l'UNIQUE source vivante du DeployPlan). Gardé HORS de actions.ts (un module
 * Next "use server" n'exporte que des fonctions async) pour que le miroir de parité live.test.ts
 * importe le décodeur PUR directement.
 *
 * LE SHAPE GO (back/mcp/deploy/deploysrv — tool `plan`) est l'ENVELOPPE planOutput :
 *   { ok: bool, plan?: deploy.DeployPlan, block?: BlockReason }
 * où deploy.DeployPlan est SNAKE_CASE (emitted_app_hash, phase_hash, stack_name, program_path,
 * has_migration, migration{steps,preserves_all_data}, order{stages,...}). Ce décodeur PONTE
 * snake→camel vers le type TS DeployPlan (lib/deploy) que le twin déclare — JAMAIS une seconde
 * déclaration de shape (NEVER DOUBLE-TYPED : le type vient de Decoded<typeof planDecoder>, aligné
 * sur DeployPlan via une vérification de structure ; un import type ne tire aucune logique).
 *
 * UN payload mal formé, OU `ok:false` (une phase refusée PHASE_NOT_STABLE), OU un `plan` absent →
 * null : readVia retombe alors sur le plan-démo déterministe (le twin buildPlan, source:"demo"),
 * et l'action surface la refus depuis le bloc. DÉTERMINISME-FIRST (§6/§8) : même JSON → même
 * verdict, zéro LLM. LE MUR (§2) : lecture sous la ligne — aucune écriture.
 */

/** Le jeu CLOS des sept stages DP26 (le twin de Go deploy.DeployStageKind). */
const STAGE_KINDS: readonly DeployStageKind[] = [
	"network",
	"volumes",
	"datastore-provision",
	"migration",
	"bootstrap",
	"healthcheck",
	"url",
];

function decodeStageKind(raw: unknown): DeployStageKind | null {
	const s = str(raw);
	if (s === null) return null;
	return (STAGE_KINDS as readonly string[]).includes(s)
		? (s as DeployStageKind)
		: null;
}

function decodeStage(raw: unknown): DeployStage | null {
	if (!isObject(raw)) return null;
	const seq = num(raw.seq);
	const kind = decodeStageKind(raw.kind);
	const detail = str(raw.detail);
	if (seq === null || kind === null || detail === null) return null;
	return { seq, kind, detail };
}

/** decodeOrder décode la section DP26 optionnelle (snake_case stack_bundle_hash/bootstrap_hash). */
function decodeOrder(raw: unknown): DeployOrder | null {
	if (!isObject(raw)) return null;
	const stages = arr(decodeStage)(raw.stages ?? []);
	const stackHash = str(raw.stack_bundle_hash);
	const bootstrapHash = str(raw.bootstrap_hash);
	const hash = str(raw.hash);
	if (
		stages === null ||
		stackHash === null ||
		bootstrapHash === null ||
		hash === null
	)
		return null;
	return {
		stages,
		stack_bundle_hash: stackHash,
		bootstrap_hash: bootstrapHash,
		hash,
	};
}

const STAGE_RANK: Record<string, number> = {
	expand: 0,
	backfill: 1,
	contract: 2,
};

function decodeMigrationStep(raw: unknown): MigrationStep | null {
	if (!isObject(raw)) return null;
	const stage = str(raw.stage);
	const sql = str(raw.sql);
	const note = str(raw.note);
	if (stage === null || sql === null || note === null) return null;
	if (!(stage in STAGE_RANK)) return null;
	return { stage: stage as MigrationStep["stage"], sql, note };
}

/** decodeMigration décode datamigrate.Plan (snake_case preserves_all_data) → le MigrationPlan TS. */
function decodeMigration(raw: unknown): MigrationPlan | null {
	if (!isObject(raw)) return null;
	const id = str(raw.id ?? "");
	const steps = arr(decodeMigrationStep)(raw.steps ?? []);
	if (id === null || steps === null) return null;
	const preserves = raw.preserves_all_data;
	if (typeof preserves !== "boolean") return null;
	return { id, steps, preservesAllData: preserves };
}

/**
 * planDecoder décode l'enveloppe `planOutput` ({ ok, plan?, block? }) et reconstruit le DeployPlan
 * TS depuis le snake_case Go. `ok:false` (phase refusée) ou un `plan` absent → null (repli démo +
 * surface du bloc). Tout champ requis manquant/mal typé → null (repli démo) — jamais une valeur
 * partielle.
 */
export const planDecoder: Decoder<DeployPlan> = (raw) => {
	if (!isObject(raw)) return null;
	if (raw.ok !== true) return null;
	const plan = raw.plan;
	if (!isObject(plan)) return null;

	const id = str(plan.id);
	const project = str(plan.project);
	const phaseHash = str(plan.phase_hash);
	const emittedAppHash = str(plan.emitted_app_hash);
	const url = str(plan.url);
	const subdomain = str(plan.subdomain);
	const stackName = str(plan.stack_name);
	const programPath = str(plan.program_path);
	const boot = arr(str)(plan.boot ?? []);
	const teardown = arr(str)(plan.teardown ?? []);
	const migration = decodeMigration(plan.migration);
	if (
		id === null ||
		project === null ||
		phaseHash === null ||
		emittedAppHash === null ||
		url === null ||
		subdomain === null ||
		stackName === null ||
		programPath === null ||
		boot === null ||
		teardown === null ||
		migration === null
	)
		return null;
	if (typeof plan.has_migration !== "boolean") return null;

	// The DP26 order is OPTIONAL (omitempty / nil for an S96 plan). Present ⇒ must decode.
	let order: DeployOrder | undefined;
	if (plan.order !== undefined && plan.order !== null) {
		const o = decodeOrder(plan.order);
		if (o === null) return null;
		order = o;
	}

	return {
		id,
		project,
		phaseHash,
		emittedAppHash,
		url,
		subdomain,
		stackName,
		programPath,
		migration,
		hasMigration: plan.has_migration,
		boot,
		teardown,
		...(order ? { order } : {}),
	};
};

/** The decoder's inferred output IS the twin's DeployPlan — never double-typed. */
export type LivePlan = Decoded<typeof planDecoder>;
