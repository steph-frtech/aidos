"use server";

import {
	buildPlan,
	type DeployInput,
	deployedMatchesPhase,
	isBlocked,
	isDeployable,
	type MigrationStep,
	migrationIsForwardOnly,
	type OrderManifest,
} from "@/lib/deploy";
import {
	cableInEnvironment,
	type EnvBindRequest,
	envServesHTTPS,
	isBlocked as isDomainBlocked,
} from "@/lib/env-domainbind";
import {
	type EmittedSurface,
	type Environment,
	type HumanValidation,
	isBlocked as isEnvBlocked,
	liveUrl,
	type PhaseInput,
	type Promotion,
	promote,
	type RollbackDecision,
	recordHumanValidation,
	rollback,
} from "@/lib/env-rollback";
import {
	buildPreviewWithBootstrap,
	isBlocked as isPreviewBlocked,
	type StackManifest,
	servedMatchesEmitted,
	teardownOf,
} from "@/lib/preview-bootstrap";
import type { DeployView, DomainView, EnvView, PreviewView } from "./view";

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

/**
 * deployManifest — the per-app DP02 StackManifest the DP26 complete deploy order is computed
 * over (the minimal /data/dockers-convention stack: one reverse-proxied server, one datastore,
 * the Go interpreter sidecar, one named bind volume, the external traefik network, one connector
 * scope). Its `app` equals the surface project (the deploy is per-app, S96). Deterministic — a
 * fixture, never drawn. Supplying it opts the plan into the seven ordered stages (DP26, additive).
 */
function deployManifest(project: string): OrderManifest {
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

	const phase = unstable
		? { phaseHash, stable: false, reasons: ["createOrder.fixture"] }
		: { phaseHash, stable: true, reasons: [] };
	const gate = { mutationScore: 0.9, mutationThreshold: 0.8, monsterCount: 0 };

	const input: DeployInput = {
		phase,
		gate,
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
		// DP26 — opt into the complete deploy ORDER (network → … → URL). The deploy targets prod
		// (a lasting environment) by default. The Stop-gate stays inherited (isDeployable).
		manifest: deployManifest(project),
		env: "prod",
	};

	// The « done is computed » Stop-gate verdict — the SAME gate the plan inherits (no separate
	// deploy-approval gate, DP26). Drives the gate badge + whether the « Déployer » is enabled.
	const { deployable, reasons } = isDeployable(phase, gate);

	const plan = buildPlan(input);
	if (isBlocked(plan))
		return {
			ok: false,
			stable: deployable,
			reasons,
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
			stable: deployable,
			reasons,
			blockCode: match.code,
			blockExplanation: match.explanation,
		};

	return {
		ok: true,
		plan,
		servedAppHash,
		servedMatches: true,
		forwardOnly,
		stable: deployable,
		reasons,
	};
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

/**
 * domainRegistry — the per-project domain→project registry the injective check runs against (the
 * DP27 demonstration fixture). It pins ONE foreign binding ("billing.acme.com" → "billing") so the
 * screen can PROVE the injectivity refusal (DOMAIN_ALREADY_BOUND naming the owner) when a second
 * project tries to claim the same domain. Deterministic — a fixture, never drawn. The Go-
 * authoritative registry lives in the truth-store; this is the screen's read-only view.
 */
const DOMAIN_REGISTRY = {
	bindings: [{ domain: "billing.acme.com", project: "billing" }],
};

/**
 * Server Action for the DP27 « Domaine custom + TLS » section (EPIC F — EXTENDS S97 domainbind,
 * never duplicates).
 *
 * THE STEP (DP27). A custom domain is CABLED into a DP06 environment (environments.ts) — the
 * binding RESOLVES the HTTPS URL (TLS via the ACME certresolver) and EMITS the DP03-canonical
 * Traefik labels (env-domainbind.cableInEnvironment, the twin of Go ResolveInEnvironment). The
 * done-criteria, reached from the screen: a custom domain SERVES the app over HTTPS (websecure +
 * tls.certresolver + redirect HTTP→HTTPS) ; a domain owned by ANOTHER project is refused
 * DOMAIN_ALREADY_BOUND naming the owner (the binding domain→project is INJECTIVE).
 *
 * DETERMINISM-FIRST (CLAUDE.md §6/§8): cableInEnvironment + envServesHTTPS are PURE functions of
 * the input (lib/env-domainbind, the twin of back/runtime/domainbind/envdomain.go) — same
 * registry + domain + env → byte-identical binding, never an LLM. The injectivity check is a pure
 * name-match (S97 reused, never forked); the emitted labels are EXACTLY the DP03 canonical set
 * (one source, never a 2nd divergent jeu). THE WALL (§2): resolving the cabling writes NO truth ;
 * the domain IN the Environment is an environment truth that moves through propose → ChangeSet →
 * approval (Go ProposeEnvironmentDomain), never a direct write from the screen.
 */
export async function domainAction(
	_prev: DomainView,
	formData: FormData,
): Promise<DomainView> {
	const domain = String(formData.get("domain") ?? "").trim();
	const project = String(formData.get("project") ?? "").trim() || "shop";
	const environment =
		String(formData.get("environment") ?? "").trim() || "prod";

	const req: EnvBindRequest = {
		domain,
		project,
		environment,
		registry: DOMAIN_REGISTRY,
	};

	const binding = cableInEnvironment(req);
	if (isDomainBlocked(binding)) {
		// DOMAIN_ALREADY_BOUND names the owner project in the explanation; we surface it as a
		// data attribute so the screen proves the injectivity violation (« déjà lié au projet … »).
		const ownerMatch = binding.explanation.match(/projet "([^"]+)"/);
		return {
			ok: false,
			blockCode: binding.code,
			blockOwner: ownerMatch ? ownerMatch[1] : undefined,
			blockExplanation: binding.explanation,
		};
	}

	return {
		ok: true,
		binding,
		// The emitted labels actually serve the app over HTTPS — judged by CODE, never an agent.
		servesHTTPS: envServesHTTPS(binding),
		labels: binding.labels,
	};
}

/* --- DP28: the env-promotion + human-validation gate + rollback section ----------------------- */

/** envSurface — the per-app emitted surface a phase re-emits (the twin reads the project; the Go
 * truth-store is authoritative for the bytes). Deterministic — a fixture, never drawn. */
function envSurface(project: string): EmittedSurface {
	return {
		project,
		serverBundleHash: `srv-${project}-001`,
		frontBundleHash: `frt-${project}-001`,
		infraHash: `inf-${project}-001`,
		datastoreHash: `dst-${project}-001`,
	};
}

/** A stable PhaseInput fixture for the env ladder (« done is computed » — green, no monster). */
function stableEnvPhase(project: string, phaseHash: string): PhaseInput {
	return {
		phase: { phaseHash, stable: true, reasons: [] },
		gate: { mutationScore: 0.9, mutationThreshold: 0.8, monsterCount: 0 },
		surface: envSurface(project),
	};
}

/** The CURRENT dev/preview phase (N) — the one the human SEES and validates (DP25). */
const DEV_PHASE = "phase-dev-current";
/** An EARLIER stable phase (N-1) in the DAG lineage — the rollback target (re-projected on demand). */
const PREV_PHASE = "phase-dev-prev";

/** parseValidation — re-hydrate the validation_humaine the screen threads back on a promote
 * (server actions are stateless). A malformed/absent value ⇒ null (fail-closed — the gate refuses). */
function parseValidation(raw: string): HumanValidation | null {
	if (!raw.trim()) return null;
	try {
		const v = JSON.parse(raw) as Partial<HumanValidation>;
		if (
			typeof v.phaseHash === "string" &&
			typeof v.validated === "boolean" &&
			typeof v.env === "string"
		) {
			// re-derive the content-address from the body — never trust a forged id.
			return recordHumanValidation({
				env: v.env as Environment,
				phaseHash: v.phaseHash,
				validated: v.validated,
				by: v.by,
			});
		}
	} catch {
		return null;
	}
	return null;
}

/**
 * Server Action for the DP28 « Promotion d'environnement + porte humaine + rollback » tab (EPIC F —
 * EXTENDS S98 envrollback, never duplicates).
 *
 * THE HUMAN-VALIDATION GATE (the heart of DP28). The human SEES the live dev/preview deployment of
 * an EXACT phase (DP25 — the real app has a URL) and VALIDATES (`validate`) or REFUSES (`refuse`)
 * it: a validation_humaine (a HITL RUNTIME, below-the-line decision — qui/quand/quelle phase/
 * validated, JAMAIS authority.Decide). APRÈS une validation validated=true de CETTE phase, la
 * promotion preview/dev → STAGING (`promote-staging`) devient permise ; SANS validation (ou un
 * refus, ou la validation d'une AUTRE phase) la promotion STAGING est REFUSÉE
 * DEV_NOT_HUMAN_VALIDATED (fail-closed, PAR PHASE). La promotion vers prod (`promote-prod`) et le
 * rollback (`rollback`, re-projeter la phase antérieure → l'app re-émise de N-1, hash égal) ne sont
 * pas gatés par cette porte.
 *
 * DETERMINISM-FIRST (CLAUDE.md §6/§8): promote/rollback/recordHumanValidation sont des fonctions
 * PURES (lib/env-rollback, le twin verdict-pour-verdict de back/archive/envrollback) — même input →
 * sortie byte-identique, jamais un LLM. La porte est une comparaison PURE fail-closed (set-membership
 * de la validation par phase). THE WALL (§2/§9): planifier/valider n'écrit AUCUNE vérité ; la
 * validation_humaine et le rollback sont des décisions enregistrées (provenance §9), jamais une
 * écriture-vers-le-kernel.
 *
 * The single action is driven by an `intent` field so the tab's controls reach the same pure twin.
 */
export async function envAction(
	_prev: EnvView,
	formData: FormData,
): Promise<EnvView> {
	const intent = String(formData.get("intent") ?? "validate");
	const project = String(formData.get("project") ?? "").trim() || "shop";
	const devPhase = String(formData.get("devPhase") ?? "").trim() || DEV_PHASE;
	// The validation_humaine the screen threads back (per-phase: it carries the phase it was made for).
	const carried = parseValidation(
		String(formData.get("devValidationJson") ?? ""),
	);

	// The live dev/preview URL the human SEES (DP25) — always recomputed for the current dev phase.
	const devUrl = liveUrl("preview", devPhase);

	// (1) VALIDATE / REFUSE — record the validation_humaine over the dev deployment (DP25).
	if (intent === "validate" || intent === "refuse") {
		const validation = recordHumanValidation({
			env: "preview",
			phaseHash: devPhase,
			validated: intent === "validate",
			by: "human",
		});
		return {
			ok: true,
			env: "preview",
			phaseHash: devPhase,
			devUrl,
			devValidation: validation,
		};
	}

	// (2) PROMOTE to staging — GATED by the human validation of the EXACT dev phase (DP28).
	if (intent === "promote-staging") {
		const result = promote({
			env: "staging",
			project,
			phase: stableEnvPhase(project, devPhase),
			devValidation: carried,
		});
		if (isEnvBlocked(result)) {
			return {
				ok: false,
				env: "staging",
				phaseHash: devPhase,
				devUrl,
				devValidation: carried,
				blockCode: result.code,
				blockExplanation: result.explanation,
			};
		}
		return {
			ok: true,
			env: "staging",
			phaseHash: devPhase,
			devUrl,
			devValidation: carried,
			promotion: result as Promotion,
		};
	}

	// (3) PROMOTE to prod — not gated by the dev validation door (DP28).
	if (intent === "promote-prod") {
		const result = promote({
			env: "prod",
			project,
			phase: stableEnvPhase(project, devPhase),
		});
		if (isEnvBlocked(result)) {
			return {
				ok: false,
				env: "prod",
				phaseHash: devPhase,
				devUrl,
				devValidation: carried,
				blockCode: result.code,
				blockExplanation: result.explanation,
			};
		}
		return {
			ok: true,
			env: "prod",
			phaseHash: devPhase,
			devUrl,
			devValidation: carried,
			promotion: result as Promotion,
		};
	}

	// (4) ROLLBACK — re-project an EARLIER stable phase (N-1). The served app of prod (N) incidented;
	// the rollback serves a FRESH re-emit of N-1 (hash égal), never a stale sandbox artifact.
	if (intent === "rollback") {
		const result = rollback({
			env: "prod",
			project,
			current: stableEnvPhase(project, devPhase),
			target: stableEnvPhase(project, PREV_PHASE),
			lineage: [PREV_PHASE],
			actor: "human",
			reason: "incident en prod — retour à la phase antérieure (DP28)",
		});
		if (isEnvBlocked(result)) {
			return {
				ok: false,
				env: "prod",
				phaseHash: devPhase,
				devUrl,
				devValidation: carried,
				blockCode: result.code,
				blockExplanation: result.explanation,
			};
		}
		return {
			ok: true,
			env: "prod",
			phaseHash: devPhase,
			devUrl,
			devValidation: carried,
			rollback: result as RollbackDecision,
		};
	}

	return { ok: false, env: "preview", phaseHash: devPhase, devUrl };
}
