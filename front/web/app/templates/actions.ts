"use server";

import {
	curated,
	fork,
	instantiate,
	pieceCount,
	type StarterProject,
	sortedNames,
	type TemplateId,
} from "@/lib/templates";

/**
 * Server Actions for the /templates Workbench panel (S81 — « Catalogue de templates / starters
 * instanciables »).
 *
 * THE STEP (ROADMAP-app-builder S81): curated templates (e-commerce, CRM, booking) packaged as
 * content-addressed bundles (entities + relations + behaviors incl. app-auth + mirrors + operations +
 * UI sources), surfaced to the duplicate-from-template of S56; "fork this app" duplicates a project at
 * a stable phase. Two action-capable controls: INSTANTIATE (duplicate-from-template → a deterministic
 * GREEN starter) and FORK (fork at a stable phase).
 *
 * THE WALL (§2/§7): every action WRITES NOTHING. Instantiate/fork are DRY-RUN value computations (the
 * deterministic twin lib/templates, the byte-twin of the Go package); landing the starter's truths
 * goes via the legal door (propose → ChangeSet → approval), never a direct kernel write. The
 * starter-project ROW (a duplicate-from-template) would be written below the line by the project/DAG
 * store path (S56). Determinism-first (§6/§8): WHAT a template contains is the DECLARED catalogue,
 * never an LLM.
 */

export interface TemplateSummary {
	id: TemplateId;
	labelFr: string;
	labelEn: string;
	bundleId: string;
	entities: number;
	relations: number;
	operations: number;
	mirrors: number;
	uiSources: number;
	behaviors: string[];
}

/** listTemplates — the curated catalogue, for the picker. PURE, read-only. */
export async function listTemplates(): Promise<TemplateSummary[]> {
	return curated().map((b) => ({
		id: b.id,
		labelFr: b.labels.fr ?? "",
		labelEn: b.labels.en ?? "",
		bundleId: b.bundle_id,
		entities: b.entities.length,
		relations: b.relations.length,
		operations: b.operations.length,
		mirrors: b.mirrors.length,
		uiSources: b.ui_sources.length,
		behaviors: b.behaviors,
	}));
}

export interface StarterView {
	ok: boolean;
	error?: string;
	template?: string;
	target?: string;
	pieces?: string[];
	pieceCount?: number;
	hasAppAuth?: boolean;
	starterId?: string;
	forked?: boolean;
	parentPhase?: string;
}

function toView(sp: StarterProject, parentPhase?: string): StarterView {
	return {
		ok: true,
		template: sp.template,
		target: sp.target,
		pieces: sortedNames(sp),
		pieceCount: pieceCount(sp),
		hasAppAuth: sp.auth !== undefined,
		starterId: sp.starter_id,
		forked: parentPhase !== undefined,
		parentPhase,
	};
}

/**
 * instantiateAction — the duplicate-from-template control (CLAUDE.md §7 ui-completeness): the user
 * picks a curated template + a target slug, and the action INSTANTIATES it into a deterministic GREEN
 * starter (the bundle's entities/relations/operations/mirrors/UI + the app-auth subsystem). It WRITES
 * NOTHING beyond the dry-run value (the wall). An empty target / unknown id is a verbatim error.
 */
export async function instantiateAction(
	_prev: StarterView,
	formData: FormData,
): Promise<StarterView> {
	const id = String(
		formData.get("template") ?? "ecommerce",
	).trim() as TemplateId;
	const target = String(formData.get("target") ?? "").trim();
	if (!target) {
		return {
			ok: true,
			error: "slug cible vide (l'honnêteté : jamais une app devinée)",
		};
	}
	try {
		return toView(instantiate(id, target));
	} catch (e) {
		return {
			ok: true,
			error: e instanceof Error ? e.message : String(e),
			target,
		};
	}
}

/**
 * forkAction — the "fork this app" control: re-instantiate a starter for a NEW slug from a stable
 * PHASE (content-addressed). The fork is a deterministic copy; the same phase → the same starterId,
 * a different phase → a different one. WRITES NOTHING (the wall).
 */
export async function forkAction(
	_prev: StarterView,
	formData: FormData,
): Promise<StarterView> {
	const id = String(
		formData.get("template") ?? "ecommerce",
	).trim() as TemplateId;
	const target = String(formData.get("target") ?? "").trim();
	const parentPhase = String(formData.get("parentPhase") ?? "").trim();
	if (!target) {
		return {
			ok: true,
			error: "slug cible vide (l'honnêteté : jamais une app devinée)",
		};
	}
	try {
		return toView(fork(id, target, parentPhase), parentPhase || "(genèse)");
	} catch (e) {
		return {
			ok: true,
			error: e instanceof Error ? e.message : String(e),
			target,
		};
	}
}
