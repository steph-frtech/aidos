import type { DeployPlan } from "@/lib/deploy";
import type { EnvDomainBinding, Label } from "@/lib/env-domainbind";
import type {
	Environment,
	HumanValidation,
	Promotion,
	RollbackDecision,
} from "@/lib/env-rollback";
import type { PreviewPlanWithBootstrap } from "@/lib/preview-bootstrap";

/**
 * View model for the /deploy panel (S96 — the phase-keyed deploy pipeline). Kept OUT of
 * actions.ts because a Next "use server" module may only export async functions — types and
 * the initial value live here so both the Server Action and the client panel import them.
 */
export interface DeployView {
	ok: boolean;
	/** the deterministic, content-addressed deploy plan (URL, boot/teardown, hashes, migration). */
	plan?: DeployPlan;
	/** the served-app hash the (modelled) running deploy reports from its emitted bytes. */
	servedAppHash?: string;
	/** whether the served-app hash equals the emitted-app hash (the re-projection property). */
	servedMatches?: boolean;
	/** whether the migration is forward-only (expand → backfill → contract). */
	forwardOnly?: boolean;
	/** the refusal code when the deploy is refused (PHASE_NOT_STABLE / OUT_OF_SCOPE / …). */
	blockCode?: string;
	/** a non-stable phase / malformed surface / breaking migration → the BlockReason explanation. */
	blockExplanation?: string;
	/* --- DP26: the « Déployer cette phase » Stop-gate state + the complete order ---------- */
	/** whether the targeted phase is STABLE (« done is computed ») — drives the gate badge +
	 * whether the « Déployer » button is enabled. Computed by the pure twin (isDeployable). */
	stable?: boolean;
	/** the gate's offending reasons when the phase is NOT deployable (the red mirrors, a
	 * below-threshold mutation score, a present monster) — named in the refusal. */
	reasons?: string[];
}

export const DEPLOY_INITIAL: DeployView = { ok: false };

/**
 * View model for the DP25 « Preview éphémère » tab (EPIC F — extends S94, never duplicates).
 * The preview RE-ÉMET from the content-addressed phase (DP05 EmitStack, the gated executor's
 * job) and AMORCES the ephemeral environment via the DP12 bootstrap, with a DP11-selectable
 * profile (`core` default, `full` for a complete preview). The CAPITAL INVARIANT: the profile
 * changes the bootstrapped SERVICES, never the EmittedAppHash of the phase — the preview
 * app-hash EQUALS the phase's emitted hash (servedMatchesEmitted), ∀ profiles.
 */
export interface PreviewView {
	ok: boolean;
	/** the DP25-extended PreviewPlan (URL + app-hash + profile + bootstrap + teardown). */
	plan?: PreviewPlanWithBootstrap;
	/** the served-app hash the (modelled) running preview reports from its emitted bytes. */
	servedAppHash?: string;
	/** whether the served-app hash EQUALS the emitted-app hash (the capital invariant). */
	hashMatches?: boolean;
	/** the deterministic teardown services (reverse boot order), surfaced for the demount button. */
	teardownServices?: string[];
	/** whether the « Démonter » action has been run (the deterministic demount, from screen). */
	teardownDone?: boolean;
	/** the linked operation the EMITTED button declares (via the web-preview sidecar). */
	emittedOp?: string;
	/** whether the EMITTED button has been clicked (the linked operation is declared, from screen). */
	emittedRun?: boolean;
	/** the refusal code when the preview is refused (UNKNOWN_PROFILE / OUT_OF_SCOPE / …). */
	blockCode?: string;
	/** the BlockReason explanation when refused (unknown profile / cross-app manifest / …). */
	blockExplanation?: string;
}

export const PREVIEW_INITIAL: PreviewView = { ok: false };

/**
 * View model for the DP27 « Domaine custom + TLS » section (EPIC F — EXTENDS S97 domainbind,
 * never duplicates). Cabling a custom domain into a DP06 environment (environments.ts) resolves
 * the HTTPS URL (TLS via the ACME certresolver) and EMITS the DP03-canonical Traefik labels
 * (env-domainbind.cableInEnvironment, the twin of Go ResolveInEnvironment). A domain belongs to
 * EXACTLY ONE project: a domain owned by another project is refused DOMAIN_ALREADY_BOUND, naming
 * the owner (the binding domain→project is INJECTIVE).
 *
 * THE WALL (CLAUDE.md §2): resolving the cabling (the emitted labels + URL) is a below-the-line
 * projection — it writes no truth. The domain IN the Environment is an environment truth: it goes
 * through propose → ChangeSet → approval (Go ProposeEnvironmentDomain), never a direct write.
 */
export interface DomainView {
	ok: boolean;
	/** the resolved env-domain binding (HTTPS URL + TLS + certresolver + emitted DP03 labels). */
	binding?: EnvDomainBinding;
	/** whether the emitted labels actually serve the app over HTTPS (envServesHTTPS — code judges). */
	servesHTTPS?: boolean;
	/** the EMITTED Traefik HTTPS labels (DP03 reused — one source, never a 2nd divergent jeu). */
	labels?: Label[];
	/** the refusal code (DOMAIN_ALREADY_BOUND when the domain is owned by another project; OUT_OF_SCOPE
	 * for a malformed domain / unknown env / a no-TLS env like local). */
	blockCode?: string;
	/** the owner project named in a DOMAIN_ALREADY_BOUND refusal (the injectivity violation). */
	blockOwner?: string;
	/** the BlockReason explanation when refused. */
	blockExplanation?: string;
}

export const DOMAIN_INITIAL: DomainView = { ok: false };

/**
 * View model for the DP28 « Promotion d'environnement + porte humaine + rollback » tab (EPIC F —
 * EXTENDS S98 envrollback, never duplicates).
 *
 * THE HUMAN-VALIDATION GATE (the heart of DP28). The human SEES the live dev/preview deployment of
 * an EXACT phase (DP25 — the real app has a URL), then VALIDATES or REFUSES it — the
 * validation_humaine. APRÈS validation → la promotion preview/dev → STAGING devient permise ; SANS
 * validation (ou un refus) → la promotion STAGING est REFUSÉE DEV_NOT_HUMAN_VALIDATED (fail-closed).
 * La validation est PAR PHASE : un nouveau déploiement dev (une autre phase) redemande une
 * validation. Plus la PROMOTION (preview/dev → staging → prod) et le ROLLBACK (re-projeter une phase
 * antérieure → l'app re-émise de N-1, hash égal).
 *
 * THE WALL (CLAUDE.md §2/§9): /deploy PLANS ; la validation_humaine est une décision HITL RUNTIME
 * below-the-line (provenancée, append-only), JAMAIS authority.Decide ; un rollback est une décision
 * enregistrée (ChangeSet + provenance), jamais une écriture-vers-le-kernel.
 */
export interface EnvView {
	ok: boolean;
	/** the env the action targeted (preview | staging | prod). */
	env?: Environment;
	/** the content-addressed phase the action operated on (the dev/promoted/rolled-back phase). */
	phaseHash?: string;
	/* --- the human-validation gate on the dev (DP28) ------------------------------------------ */
	/** the live dev/preview URL the human SEES (DP25) — the real app they validate or refuse. */
	devUrl?: string;
	/** the validation_humaine recorded for the CURRENT dev phase (null until the human acts). */
	devValidation?: HumanValidation | null;
	/* --- promotion (the env ladder) ----------------------------------------------------------- */
	/** the Promotion produced when a hop is permitted (staging only when the dev phase is validated). */
	promotion?: Promotion;
	/* --- rollback ----------------------------------------------------------------------------- */
	/** the RollbackDecision produced when rolling back to an earlier stable phase (re-projection). */
	rollback?: RollbackDecision;
	/* --- refusals ----------------------------------------------------------------------------- */
	/** the refusal code (DEV_NOT_HUMAN_VALIDATED / ENV_PROMOTE_NOT_STABLE / ROLLBACK_NOT_EARLIER / …). */
	blockCode?: string;
	/** the BlockReason explanation when refused (no validation / wrong phase / refused / not earlier). */
	blockExplanation?: string;
}

export const ENV_INITIAL: EnvView = { ok: false };
