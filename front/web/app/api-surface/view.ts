import type { PactContract } from "@/lib/api-surface";

/**
 * View model for the /api-surface panel (S90). Kept OUT of actions.ts because a Next
 * "use server" module may only export async functions — types and the initial value
 * live here so both the Server Action and the client panel can import them.
 */
export interface SurfaceView {
	ok: boolean;
	/** the emitted OpenAPI 3.1 document bytes + its content address. */
	openapi?: string;
	openapiHash?: string;
	/** the emitted Hono/TS router bytes. */
	router?: string;
	/** the Pact suite — one contract per sync operation. */
	contracts?: PactContract[];
	/** provider verification on ALL emitted endpoints. */
	verifyPass?: boolean;
	verifyReason?: string;
	verifyInteractions?: string[];
	/** a malformed spec → the typed BlockReason explanation. */
	blockExplanation?: string;
}

export const SURFACE_INITIAL: SurfaceView = { ok: false };
