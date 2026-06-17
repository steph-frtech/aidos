/**
 * templates-data — the DETERMINISTIC demo fixtures for the /templates panel (S81; the ADR 0092
 * batch-3 flip). It holds the curated catalogue summaries + the twin `instantiate()` / `fork()`
 * compute of a starter, as the demo `TemplateSummary[]` / `StarterView` the panel falls back to when
 * the gateway is unreachable (`source:"demo"`).
 *
 * THE TWIN IS NOW THE DEMO, NOT THE LIVE PATH (ADR 0092). Before this flip /templates computed its
 * displayed catalogue + starter from the TS twin `lib/templates.curated()/instantiate()/fork()`
 * directly in actions.ts/page.tsx — the twin WAS the live source. The flip routes `listTemplates` /
 * `instantiateAction` / `forkAction` through the Go engine via the passerelle
 * (`readVia(scope, "templates_list" | "templates_instantiate" | "templates_fork", …)`, the dispatched
 * below-the-line reads of the templates MCP server); these fixtures are KEPT only as the deterministic
 * fallback. The presence of this `-data.ts` sibling is ALSO what makes the T5 cliquet
 * (twin-as-live-fitness) RECOGNISE `lib/templates` as a twin — the panel stays GREEN because
 * `actions.ts`/`page.tsx` import the `readVia` frontier (the witness the twin sits behind
 * `source:"demo"`). Without this sibling the cliquet was BLIND to `lib/templates` (no `-data.ts`),
 * so the un-flipped twin-read slipped through unguarded.
 *
 * DETERMINISM-FIRST (CLAUDE.md §6/§8): the demo catalogue / starter is the same PURE twin compute the
 * Go `templates.Curated()/Instantiate()/Fork()` reproduces — same id+target+phase → byte-identical
 * starter (the content-addressed bundleId / starterId match Go, pinned by lib/templates.test.ts). The
 * parity mirror app/templates/live.test.ts pins the decoders' shape == the Go listOutput /
 * instantiateOutput contract.
 *
 * THE WALL (CLAUDE.md §2): instantiate/fork are DRY-RUN value computations (WroteKernel always false);
 * landing a starter's truths goes via the legal door (templates.Propose → ChangeSet → approval),
 * never these reads. These fixtures and the panel WRITE NOTHING.
 */

import {
	curated,
	fork,
	instantiate,
	pieceCount,
	type StarterProject,
	sortedNames,
	type TemplateId,
} from "./templates";

/**
 * TemplateSummary — one curated bundle's catalogue card (id, FR/EN labels, content-addressed bundleId,
 * piece counts, behaviors). This is the SINGLE shape both the live `templates_list` decoder and the
 * demo fallback produce, so the catalogue display is identical whether source is "live" or "demo".
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

/**
 * StarterView — the decoded `templates_instantiate` / `templates_fork` result the panel renders: the
 * deterministic GREEN starter's shape (template, target, sorted piece names, count, app-auth presence,
 * content-addressed starterId), or a verbatim error. Both the live decoder and the demo builder
 * produce this exact shape.
 */
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

/**
 * demoCatalogue is the deterministic demo `TemplateSummary[]` — the twin `curated()` of the curated
 * bundles projected to the catalogue-card shape. It is the catalogue the panel falls back to, identical
 * in shape to the live decoded `templates_list` read (the twin sits behind `source:"demo"`).
 */
export function demoCatalogue(): TemplateSummary[] {
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

/** starterToView — the StarterProject → StarterView projection (byte-twin of the Go toInstantiateOutput). */
export function starterToView(
	sp: StarterProject,
	parentPhase?: string,
): StarterView {
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
 * demoInstantiate is the deterministic demo instantiated starter — the twin `instantiate()` of a
 * template for a target slug, projected to the StarterView. It is the `StarterView` the panel falls
 * back to, identical in shape to the live decoded `templates_instantiate` read (the twin sits behind
 * `source:"demo"`).
 */
export function demoInstantiate(id: TemplateId, target: string): StarterView {
	return starterToView(instantiate(id, target));
}

/**
 * demoFork is the deterministic demo forked starter — the twin `fork()` of a template for a NEW slug
 * from a parent phase, projected to the StarterView. Identical in shape to the live decoded
 * `templates_fork` read.
 */
export function demoFork(
	id: TemplateId,
	target: string,
	parentPhase: string,
): StarterView {
	return starterToView(
		fork(id, target, parentPhase),
		parentPhase || "(genèse)",
	);
}
