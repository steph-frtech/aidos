import type { ControlModel, FrontFile } from "@/lib/front-emitter";
import type { Source } from "@/lib/gateway-sdk";

/**
 * View model for the /front-emitter panel (S93 — the emitted app's FRONT-END). Kept OUT of
 * actions.ts because a Next "use server" module may only export async functions — types and the
 * initial value live here so both the Server Action and the client panel import them.
 */
export interface FrontView {
	ok: boolean;
	/** whether the emit came from the LIVE gateway (Go front-emitter) or the demo twin (ADR 0092). */
	source?: Source;
	/** the emitted front files (index + per-entity forms + controls). */
	files?: FrontFile[];
	/** the concatenated bundle bytes + its display digest (byte-identity surface). */
	bundle?: string;
	bundleHash?: string;
	/** the controls (so the panel renders REAL action-capable buttons with their sensors). */
	controls?: ControlModel[];
	/** the emitted order form's HTML-ish source (so the panel renders the live form). */
	orderFormBytes?: string;
	/** a malformed spec → the typed BlockReason explanation. */
	blockExplanation?: string;
}

export const FRONT_INITIAL: FrontView = { ok: false };
