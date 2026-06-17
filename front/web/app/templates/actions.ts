"use server";

import { readVia } from "@/lib/gateway-sdk";
import { panelScope } from "@/lib/panelScope";
import type { TemplateId } from "@/lib/templates";
import {
	demoCatalogue,
	demoFork,
	demoInstantiate,
	type StarterView,
	type TemplateSummary,
} from "@/lib/templates-data";
import { catalogueDecoder, starterDecoder } from "./live";

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
 * THE FLIP (ADR 0092 — the Go engine is the SINGLE live source). `listTemplates` / `instantiateAction`
 * / `forkAction` now read the LIVE catalogue + starter from the Go templates MCP server through the
 * passerelle (`readVia(scope, "templates_list" | "templates_instantiate" | "templates_fork", …)`, the
 * dispatched below-the-line reads), with the twin `lib/templates.curated()/instantiate()/fork()`
 * preserved ONLY as the deterministic demo fallback (`lib/templates-data`, tagged `source:"live"|"demo"`).
 * The `readVia` frontier import keeps the T5 cliquet GREEN (the twin sits behind the demo fallback,
 * never as the live source); without the new `lib/templates-data` sibling the cliquet was BLIND to
 * `lib/templates` and the un-flipped inline twin-read slipped through unguarded.
 *
 * DETERMINISM-FIRST (CLAUDE.md §6/§8): the decoders + the demo fallback (the same pure twin compute the
 * Go engine reproduces — byte-identical content-addressed starterId) are pure; a malformed /
 * undispatched / refused answer yields the demo catalogue / starter. THE WALL (§2/§7): every action
 * WRITES NOTHING — instantiate/fork are DRY-RUN value computations (wrote_kernel always false); landing
 * the starter's truths goes via the legal door (templates.Propose → ChangeSet → approval), never these
 * read tools.
 */

export type { StarterView, TemplateSummary };

/** listTemplates — the curated catalogue, for the picker. LIVE read; the twin is the demo fallback. */
export async function listTemplates(): Promise<TemplateSummary[]> {
	const scope = await panelScope();
	const { data } = await readVia(
		scope,
		"templates_list",
		{},
		catalogueDecoder,
		demoCatalogue(),
	);
	return data;
}

/**
 * instantiateAction — the duplicate-from-template control (CLAUDE.md §7 ui-completeness): the user
 * picks a curated template + a target slug, and the action INSTANTIATES it into a deterministic GREEN
 * starter (the bundle's entities/relations/operations/mirrors/UI + the app-auth subsystem) via the LIVE
 * Go templates server, the twin demoInstantiate() as the deterministic fallback. It WRITES NOTHING
 * beyond the dry-run value (the wall). An empty target / unknown id is a verbatim error.
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
	const scope = await panelScope();
	const { data } = await readVia(
		scope,
		"templates_instantiate",
		{ id, target },
		starterDecoder,
		demoInstantiate(id, target),
	);
	return data;
}

/**
 * forkAction — the "fork this app" control: re-instantiate a starter for a NEW slug from a stable
 * PHASE (content-addressed). The fork is a deterministic copy via the LIVE Go templates server; the
 * twin demoFork() is the deterministic fallback. The Go instantiateOutput does not echo the parent
 * phase, so the panel layers `forked`/`parentPhase` on top of the live starter shape (the same phase
 * → the same starterId, a different phase → a different one). WRITES NOTHING (the wall).
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
	const scope = await panelScope();
	const { data } = await readVia(
		scope,
		"templates_fork",
		{ id, target, parent_phase: parentPhase },
		starterDecoder,
		demoFork(id, target, parentPhase),
	);
	if (!data.ok || data.error) return data;
	// The Go fork output is shape-identical to instantiate (no parent_phase echo); the panel marks the
	// fork + carries the phase for display (the demo fallback already does this).
	return { ...data, forked: true, parentPhase: parentPhase || "(genèse)" };
}
