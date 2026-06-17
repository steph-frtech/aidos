import { arr, type Decoder, isObject, num, str } from "../../lib/gateway-sdk";
import type { TemplateId } from "../../lib/templates";
import type { StarterView, TemplateSummary } from "../../lib/templates-data";

/**
 * /templates live reads — the decoders over the Go templates MCP server's output (S81; the ADR 0092
 * batch-3 flip). Kept OUT of actions.ts (a Next "use server" module may only export async functions)
 * so the parity mirror (live.test.ts) can import the PURE decoders directly.
 *
 * NEVER DOUBLE-TYPED (the flip done-criterion): each decoder is the SINGLE runtime declaration of the
 * live wire shape; the static TemplateSummary / StarterView (from lib/templates-data) are the front
 * twin's types the decoders fill. The parity mirror pins the decoders == the Go contract
 * (templatessrv.listOutput: { ok, templates: bundleSummary[] } with bundleSummary.id / labels /
 * bundle_id / entities / relations / behaviors / operations / mirrors / ui_sources ;
 * templatessrv.instantiateOutput: { ok, template / target / pieces / piece_count / has_app_auth /
 * starter_id / wrote_kernel }), NOT a second implementation of the catalogue / instantiation logic
 * (the Go templates.Curated/Instantiate/Fork is authoritative).
 *
 * DETERMINISM-FIRST (§6/§8): same JSON → same verdict; a malformed payload returns null and readVia
 * falls back to the demo catalogue / starter. THE WALL (§2): these are below-the-line reads —
 * instantiate/fork are DRY-RUN VALUES (wrote_kernel always false); no truth is written.
 */

/** decodeBundleSummary decodes one Go listOutput bundleSummary into a front TemplateSummary. */
function decodeBundleSummary(raw: unknown): TemplateSummary | null {
	if (!isObject(raw)) return null;
	const id = str(raw.id);
	const entities = num(raw.entities);
	const relations = num(raw.relations);
	const operations = num(raw.operations);
	const mirrors = num(raw.mirrors);
	const uiSources = num(raw.ui_sources);
	const bundleId = str(raw.bundle_id);
	if (
		id === null ||
		entities === null ||
		relations === null ||
		operations === null ||
		mirrors === null ||
		uiSources === null ||
		bundleId === null
	) {
		return null;
	}
	// labels is a { fr?, en? } map; an absent label decodes to "" (FR required-by-fallback at display).
	const labels = isObject(raw.labels) ? raw.labels : {};
	const behaviors = arr(str)(raw.behaviors ?? []) ?? [];
	return {
		id: id as TemplateId,
		labelFr: str(labels.fr) ?? "",
		labelEn: str(labels.en) ?? "",
		bundleId,
		entities,
		relations,
		operations,
		mirrors,
		uiSources,
		behaviors,
	};
}

/**
 * catalogueDecoder decodes the Go `templates_list` listOutput ({ ok, templates }) into the front
 * TemplateSummary[]. A non-ok payload or a missing/malformed `templates` list → null (→ demo
 * fallback). An empty catalogue (ok with []) decodes to [] (a faithful empty live read).
 */
export const catalogueDecoder: Decoder<TemplateSummary[]> = (raw) => {
	if (!isObject(raw)) return null;
	if (raw.ok === false) return null;
	const decoded = arr(decodeBundleSummary)(raw.templates ?? []);
	return decoded;
};

/**
 * starterDecoder decodes the Go `templates_instantiate` / `templates_fork` instantiateOutput into the
 * front StarterView. A non-ok payload with a verbatim error decodes to an error StarterView (the
 * deterministic "slug cible vide" / "unknown id" path the Go server returns); an ok payload carries
 * the deterministic GREEN starter (template / target / sorted pieces / count / app-auth / starterId).
 * `forked` is set when a parent phase rode the request (the fork tool). A malformed payload → null.
 */
export const starterDecoder: Decoder<StarterView> = (raw) => {
	if (!isObject(raw)) return null;
	if (typeof raw.ok !== "boolean") return null;
	// The Go server answers ok:true even on a domain error (it carries `error` verbatim).
	const error = str(raw.error);
	if (error !== null && error !== "") {
		return { ok: true, error, target: str(raw.target) ?? undefined };
	}
	const starterId = str(raw.starter_id);
	if (starterId === null || starterId === "") return null;
	const pieces = arr(str)(raw.pieces ?? []) ?? [];
	const parentPhaseRaw = str(raw.parent_phase);
	const parentPhase =
		parentPhaseRaw !== null && parentPhaseRaw !== ""
			? parentPhaseRaw
			: undefined;
	return {
		ok: true,
		template: str(raw.template) ?? undefined,
		target: str(raw.target) ?? undefined,
		pieces,
		pieceCount: num(raw.piece_count) ?? pieces.length,
		hasAppAuth: raw.has_app_auth === true,
		starterId,
		forked: parentPhase !== undefined,
		parentPhase,
	};
};
