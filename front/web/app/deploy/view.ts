import type { DeployPlan } from "@/lib/deploy";
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
