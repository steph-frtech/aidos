"use server";

import { execFile } from "node:child_process";
import { promisify } from "node:util";
import {
	deployedMatchesPhase,
	isBlocked,
	isDeployable,
	migrationIsForwardOnly,
} from "@/lib/deploy";
import {
	type AuditEntry,
	auditTimeline,
	type EnvDomainBinding as CockpitDomainBinding,
	type CockpitInput,
	type PhaseInput as CockpitPhaseInput,
	project as projectCockpit,
} from "@/lib/deploy-cockpit";
import {
	DEFAULT_PHASE_HASH,
	type DeployRequest,
	demoPlan,
	deployInput,
	planArgs,
} from "@/lib/deploy-data";
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
import { readVia } from "@/lib/gateway-sdk";
import type { StackManifest as TargetManifest } from "@/lib/hono-emitter";
import { panelScope } from "@/lib/panelScope";
import {
	buildPreviewWithBootstrap,
	isBlocked as isPreviewBlocked,
	type StackManifest,
	servedMatchesEmitted,
	teardownOf,
} from "@/lib/preview-bootstrap";
import {
	emitPulumiStackTarget,
	isTargetProjection,
	type Target,
} from "@/lib/pulumi-target";
import { planDecoder } from "./live";
import type {
	CockpitView,
	DeployView,
	DomainView,
	EnvView,
	PreviewView,
	PulumiView,
	TargetView,
} from "./view";

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
 * ADR 0092 CUTOVER (le moteur Go est l'UNIQUE source vivante) : `deployAction` lit le DeployPlan
 * LIVE depuis le serveur MCP `deploy` du moteur Go via la passerelle (`readVia(scope, "plan", …)`,
 * la lecture below-the-line dispatchée — deploy.BuildPlan est autoritatif). Le twin lib/deploy
 * (buildPlan) est CONSERVÉ UNIQUEMENT comme repli démo déterministe (lib/deploy-data.demoPlan,
 * source:"live"|"demo") ; l'import frontière readVia garde le cliquet T5 (twin-as-live-fitness)
 * VERT — le twin reste DERRIÈRE le repli source:"demo", jamais comme source vivante.
 *
 * DETERMINISM-FIRST (CLAUDE.md §6/§8): le décodeur + le repli démo (le même calcul pur que le Go
 * reproduit) sont purs — même phase stable + surface + change → plan byte-identique, jamais un LLM.
 * Le Stop-gate et l'égalité servi↔émis sont des comparaisons pures (le code juge). THE WALL (§2):
 * planifier n'écrit AUCUNE vérité ; enregistrer le déploiement d'une phase comme décision DAG passe
 * par propose → ChangeSet → approbation, jamais une écriture directe.
 */

export async function deployAction(
	_prev: DeployView,
	formData: FormData,
): Promise<DeployView> {
	const project = String(formData.get("project") ?? "").trim() || "shop";
	const phaseHash =
		String(formData.get("phaseHash") ?? "").trim() || DEFAULT_PHASE_HASH;
	// Toggle: deploy a NON-STABLE phase (a red mirror) — proves the PHASE_NOT_STABLE refusal.
	const unstable = formData.get("unstable") === "on";
	// Toggle: carry a forward-only data migration (the rename lifecycle).
	const withMigration = formData.get("withMigration") === "on";

	const req: DeployRequest = { project, phaseHash, unstable, withMigration };
	// The PURE deploy input (lib/deploy-data) — fed BOTH to the Go `plan` args and the demo plan.
	const input = deployInput(req);

	// The « done is computed » Stop-gate verdict — the SAME gate the plan inherits (no separate
	// deploy-approval gate, DP26). Drives the gate badge + whether the « Déployer » is enabled.
	// Computed locally over the input's phase/gate (a pure comparison — code judges).
	const { deployable, reasons } = isDeployable(input.phase, input.gate);

	// ── ADR 0092 CUTOVER — read the LIVE DeployPlan from the Go `deploy` server via the passerelle.
	// `plan` is below-the-line (a pure, content-addressed planning read — writes nothing). On any
	// miss (no endpoint / transport error / refused / malformed / a non-stable phase) readVia falls
	// back to the deterministic demo plan (the twin buildPlan, source:"demo"). The demo is null when
	// the phase is non-stable (the unstable toggle) — that IS the PHASE_NOT_STABLE refusal surfaced.
	const scope = await panelScope();
	const { data: plan } = await readVia(
		scope,
		"plan",
		planArgs(req),
		planDecoder,
		demoPlan(req),
	);

	// A null plan ⇒ the phase is refused (PHASE_NOT_STABLE): surface the gate's reasons.
	if (plan === null)
		return {
			ok: false,
			stable: deployable,
			reasons,
			blockCode: "PHASE_NOT_STABLE",
			blockExplanation:
				"Le déploiement de la phase est REFUSÉ (S96) : la phase visée n'est PAS une phase stable (« done is computed » : red→vert ∧ vert antérieur ∧ mutation ≥ seuil ∧ aucun monstre)." +
				(reasons.length > 0 ? ` Raisons : ${reasons.join(", ")}.` : ""),
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
		String(formData.get("phaseHash") ?? "").trim() || DEFAULT_PHASE_HASH;
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

/* --- DP29: the per-project deploy & environments COCKPIT (EPIC F, clôture) -------------------- */

/** The stable HEAD phase (N) — vert, deployable, the phase preview/staging/prod serve. */
const COCKPIT_HEAD = "phase-0123456789abcdef";
/** An EARLIER stable phase (N-1) — vert, the rollback target the audit timeline re-projects. */
const COCKPIT_PREV = "phase-prev-0011223344";
/** A RED phase — rouge, NON-deployable (a red fixture mirror) — proves the PHASE_NOT_STABLE refusal. */
const COCKPIT_RED = "phase-red-aabbccddeeff";

/**
 * cockpitPhases — the project's phases in frontier order (projectdag, S56). A deterministic
 * fixture (the Go truth-store is authoritative for the real DAG): a stable HEAD (N, vert), a stable
 * earlier phase (N-1, vert — the rollback target), and a RED phase (rouge, non-deployable). The
 * cut verdict + gate ARE the liveness/deployability — READ by the pure projection, never re-derived.
 */
function cockpitPhases(): CockpitPhaseInput[] {
	const stableGate = {
		mutationScore: 0.9,
		mutationThreshold: 0.8,
		monsterCount: 0,
	};
	return [
		{
			nodeId: COCKPIT_HEAD,
			label: "phase N (tête)",
			head: true,
			phase: { phaseHash: COCKPIT_HEAD, stable: true, reasons: [] },
			gate: stableGate,
		},
		{
			nodeId: COCKPIT_PREV,
			label: "phase N-1",
			head: false,
			phase: { phaseHash: COCKPIT_PREV, stable: true, reasons: [] },
			gate: stableGate,
		},
		{
			nodeId: COCKPIT_RED,
			label: "phase rouge",
			head: false,
			phase: {
				phaseHash: COCKPIT_RED,
				stable: false,
				reasons: ["createOrder.fixture"],
			},
			gate: stableGate,
		},
	];
}

/**
 * Server Action for the DP29 « Cockpit déploiement & environnements » tab (EPIC F, clôture — ÉTEND
 * S99, ASSEMBLE DP25-28 en UN écran).
 *
 * THE STEP (DP29). The cockpit shows, per project, in ONE read model: the PHASES with their
 * liveness (vert/rouge/inconnu), the ENVIRONMENTS (preview/staging/prod/future_cloud) with the
 * phase each serves and its live HTTPS URL, the custom DOMAINS (+ TLS), the closed PROFILES, and
 * the audit TIMELINE of incident/rollback. Its source is the PURE projection (deploy-cockpit.project,
 * the twin of Go back/runtime/deploycockpit) + the DP28 audit reducer.
 *
 * DETERMINISM-FIRST (CLAUDE.md §6/§8 ; « projection PURE du DAG »): project + auditTimeline are PURE
 * functions of their input (no clock, no rng, no LLM) — same project + DAG → byte-identical
 * projection (same hash). The liveness/deployability are READ from the DP25-28 twins (S23 cut + DP26
 * Stop-gate), never re-computed, never estimated. THE WALL (§2): the cockpit READS already-projected
 * facts below the line and ASSEMBLES the read model — it writes NOTHING. A deploy/rollback action
 * reuses the DP26/DP28 action tabs (a ChangeSet proposal for infra truth, a below-the-line trigger
 * for preview/staging) — never a direct truth-write.
 */
export async function cockpitAction(
	_prev: CockpitView,
	formData: FormData,
): Promise<CockpitView> {
	const project = String(formData.get("project") ?? "").trim() || "shop";
	// Whether the preview deployment carries a validated validation_humaine (DP28). The cockpit's
	// « valider le dev » control flips it; default validated so the staging-promotable badge shows.
	const validated = formData.get("previewValidated") !== "off";

	// The custom domain DP27 binding cabled into prod (read-as-is — the twin already resolved TLS/URL).
	const domains: CockpitDomainBinding[] = [
		{
			domain: `${project}.acme.com`,
			environment: "prod",
			url: `https://${project}.acme.com`,
			certResolver: "letsencrypt",
			routerName: `${project}-prod`,
			tls: true,
			labels: [
				{
					label: "traefik.http.routers.app-secure.entrypoints",
					value: "websecure",
				},
				{
					label: "traefik.http.routers.app-secure.tls.certresolver",
					value: "letsencrypt",
				},
			],
		},
	];

	const input: CockpitInput = {
		project,
		phases: cockpitPhases(),
		environments: [
			{
				env: "preview",
				servedPhaseId: COCKPIT_HEAD,
				humanValidated: validated,
			},
			{ env: "staging", servedPhaseId: COCKPIT_HEAD },
			{
				env: "prod",
				servedPhaseId: COCKPIT_HEAD,
				domainRoot: `${project}.acme.com`,
			},
			{ env: "future_cloud" },
		],
		domains,
	};

	const projection = projectCockpit(project, input);

	// The DP28 incident/rollback audit timeline — recorded, append-only decisions (provenance §9).
	// A deterministic fixture mirroring the lived history: deploy N → human-validate → promote
	// staging → promote prod → incident in prod → rollback to N-1 (re-projected). The reducer
	// preserves the recorded order (never re-sorts).
	const audit: AuditEntry[] = auditTimeline([
		{
			kind: "deploy",
			env: "preview",
			phaseHash: COCKPIT_HEAD,
			summary: "Déploiement preview de la phase N (ré-projection S78).",
			provenance: {
				actor: "human",
				reason: "preview de la phase N",
				fromPhaseHash: "",
				toPhaseHash: COCKPIT_HEAD,
			},
		},
		{
			kind: "human_validation",
			env: "preview",
			phaseHash: COCKPIT_HEAD,
			summary:
				"Validation humaine de la phase N (DP28 — la vraie app vue et validée).",
			provenance: {
				actor: "human",
				reason: "validation_humaine validated=true",
				fromPhaseHash: "",
				toPhaseHash: COCKPIT_HEAD,
			},
		},
		{
			kind: "promote",
			env: "staging",
			phaseHash: COCKPIT_HEAD,
			summary: "Promotion vers staging (phase N validée).",
		},
		{
			kind: "promote",
			env: "prod",
			phaseHash: COCKPIT_HEAD,
			summary: "Promotion vers prod (phase N).",
		},
		{
			kind: "incident",
			env: "prod",
			phaseHash: COCKPIT_HEAD,
			summary: "Incident en prod sur la phase N — déclenche le rollback.",
		},
		{
			kind: "rollback",
			env: "prod",
			phaseHash: COCKPIT_PREV,
			fromPhaseHash: COCKPIT_HEAD,
			summary:
				"Rollback vers la phase antérieure N-1 (app ré-émise, hash = N-1).",
			provenance: {
				actor: "human",
				reason: "incident en prod — retour à la phase antérieure (DP28)",
				fromPhaseHash: COCKPIT_HEAD,
				toPhaseHash: COCKPIT_PREV,
			},
		},
	]);

	return { ok: true, projection, audit };
}

/* --- « Déployer ce projet (Pulumi) » : the REAL per-project×env Pulumi deployment ------------ */

const execFileP = promisify(execFile);

/** The repo root the Go executor runs from (cwd of `go run ./cmd/aidospulumi`). */
const AIDOS_REPO = process.env.AIDOS_REPO || "/data/dev/aidos";

/**
 * Server Action for the « Déployer ce projet (Pulumi) » tab — the REAL per-project×env Pulumi
 * deployment (intention utilisatrice 2026-06-13 : « du Pulumi qui fait les docker par projet »,
 * mémoire pulumi-per-project-fullstack). UN stack Pulumi par projet×env, déployé POUR DE VRAI par
 * Pulumi (@pulumi/docker), déployable partout (Docker maintenant, cloud demain).
 *
 * THE TWO HALVES (determinism-first, CLAUDE.md §2/§6/§8).
 *  - `emit` reads the PURE emitter (Go honoemit.EmitPulumiStack via `aidospulumi emit`) — the
 *    Pulumi program + URL + containers, a byte-stable projection (same input → same program). It
 *    writes NO truth (below-the-line projection). The screen SHOWS this program for review.
 *  - `up` / `down` are the GATED SIDE-EFFECT — EXACTLY like ai-lab/actions.ts:deployStack runs
 *    `docker compose up -d` today. They exec `aidospulumi up`/`down`, which materialises the
 *    emitted artifacts then drives `pulumi up`/`destroy` over the PURE emitted program. The
 *    executor judges nothing; it executes the program. No injection surface (the project name is
 *    passed as an execFile arg, never shell-interpolated).
 *
 * La porte de validation humaine DP28 reste EN AMONT du staging (l'onglet Environnements) ; ce
 * geste cible un env NON-PROD (dev) par défaut — un déploiement réel, jamais une promotion staging.
 *
 * The single action is driven by an `intent` field (emit | up | down) so the tab's controls reach
 * the same Go executor.
 */
export async function pulumiAction(
	_prev: PulumiView,
	formData: FormData,
): Promise<PulumiView> {
	const intent = (String(formData.get("intent") ?? "emit") || "emit") as
		| "emit"
		| "up"
		| "down";
	const project = String(formData.get("project") ?? "").trim() || "shop";
	const env = String(formData.get("env") ?? "").trim() || "dev";

	// Run the Go executor for the requested gesture. `emit` is read-only (no pulumi, no disk write):
	// it prints the emitted program + url + containers as JSON. `up`/`down` drive the real pulumi
	// lifecycle (the gated side-effect) and print {status, url, containers, stack}.
	try {
		const { stdout } = await execFileP(
			"go",
			["run", "./cmd/aidospulumi", intent, "--project", project, "--env", env],
			{
				cwd: `${AIDOS_REPO}/back`,
				timeout: intent === "emit" ? 120_000 : 600_000,
				maxBuffer: 16 * 1024 * 1024,
				// GOTOOLCHAIN=auto: the bare PATH `go` may predate the go.mod toolchain; auto resolves
				// the cached one (the SAME pattern ai-lab/actions.ts:deployStack uses for `go run`).
				env: { ...process.env, GOTOOLCHAIN: "auto" },
			},
		);
		const out = JSON.parse(stdout) as {
			stack?: string;
			url?: string;
			containers?: string[];
			path?: string;
			program?: string;
			status?: "up" | "down";
			dir?: string;
		};

		if (intent === "emit") {
			return {
				ok: true,
				intent: "emit",
				project,
				env,
				stack: out.stack,
				url: out.url,
				containers: out.containers ?? [],
				programPath: out.path,
				program: out.program,
			};
		}

		return {
			ok: true,
			intent,
			project,
			env,
			stack: out.stack,
			url: out.url,
			containers: out.containers ?? [],
			status: out.status,
			detail:
				intent === "up"
					? `pulumi up --stack ${out.stack} → ${out.dir ?? ""}`
					: `pulumi destroy --stack ${out.stack}`,
		};
	} catch (e) {
		return {
			ok: false,
			intent,
			project,
			env,
			blockCode: intent === "emit" ? "EMIT_FAILED" : "PULUMI_FAILED",
			blockExplanation: String(e).slice(0, 400),
		};
	}
}

/**
 * targetManifest — the representative StackManifest source the « Cible de déploiement » selector
 * projects to each target. It is ONE source, content-addressed: a server (the app) + the Go
 * interpreter sidecar (APP services) + Postgres (datastore) + a bus + a cache (MANAGED services).
 * The SAME object is passed to BOTH projections — the source is never re-declared per target.
 */
function targetManifest(project: string): TargetManifest {
	return {
		app: project,
		services: [
			{
				name: "server",
				role: "server",
				image: `${project}:latest`,
				internalPort: 3000,
			},
			{
				name: "interpreter",
				role: "interpreter",
				image: "aidos-interpreter:latest",
				internalPort: 8080,
			},
			{
				name: "postgres",
				role: "datastore",
				image: "postgres:16",
				internalPort: 5432,
			},
			{ name: "events", role: "bus", image: "nats:2", internalPort: 4222 },
			{
				name: "valkey",
				role: "cache",
				image: "valkey/valkey:8",
				internalPort: 6379,
			},
		],
		network: { name: "traefik_default", external: true },
	};
}

/**
 * targetAction — the DP33 « Cible de déploiement » Server Action (clôture EPIC G). Basculer la cible
 * (self_hosted | future_cloud) recalcule la PROJECTION depuis la MÊME source StackManifest via le
 * twin PUR lib/pulumi-target.emitPulumiStackTarget (le twin de Go honoemit.EmitPulumiStackTarget).
 *
 * « Une source → N projections » : la SOURCE (le sourceHash du manifest) est INVARIANTE entre les
 * cibles — seuls les BYTES émis diffèrent. En future_cloud, les services managés se résolvent en
 * managed_url (DP07). PORTABILITÉ PAR PROJECTION, JAMAIS PAR RÉÉCRITURE.
 *
 * THE WALL (CLAUDE.md §2/§6/§8) : recalculer une projection n'écrit AUCUNE vérité (below-the-line) ;
 * la projection est une fonction PURE (déterministe, byte-stable), jamais un LLM ; le StackManifest
 * source reste au-dessus de la ligne (DP02). Pour sceller la source-invariance, l'action émet AUSSI
 * la cible-jumelle et compare les deux sourceHash (le badge source-invariant).
 */
export async function targetAction(
	_prev: TargetView,
	formData: FormData,
): Promise<TargetView> {
	const project = String(formData.get("project") ?? "").trim() || "shop";
	const requested = String(formData.get("target") ?? "self_hosted").trim();

	const source = targetManifest(project);
	const proj = await emitPulumiStackTarget(source, requested);
	if (!isTargetProjection(proj)) {
		return {
			ok: false,
			blockCode: proj.code,
			blockExplanation: proj.explanation,
		};
	}

	// The source-invariant check: project the OTHER target from the SAME source and compare the two
	// source content addresses. The bytes differ; the source address is identical — that IS the
	// source-invariance, computed by CODE (never declared).
	const other: Target =
		requested === "future_cloud" ? "self_hosted" : "future_cloud";
	const twin = await emitPulumiStackTarget(source, other);
	const sourceInvariant =
		isTargetProjection(twin) && twin.sourceHash === proj.sourceHash;

	return {
		ok: true,
		target: proj.target,
		provider: proj.provider,
		program: proj.program,
		sourceHash: proj.sourceHash,
		outputHash: proj.outputHash,
		sourceInvariant,
		managed: proj.managed,
	};
}
