import type { EnforceSnapshot, PromoteSnapshot } from "@/lib/autonomy-data";
import type { Source } from "@/lib/gateway-sdk";

/**
 * /autonomy view shapes — the typed results the two Server Actions return to the panel
 * (kill-twins batch-2, ADR 0092). Each carries the live-or-demo `source` tag so the panel renders
 * an honest live/demo badge. Kept OUT of actions.ts (a "use server" module may only export async
 * functions) and OUT of live.ts (decoders) so the panel + the parity mirror import the types freely.
 */

/** The ENFORCE control result: the Go-authoritative (or demo) verdict + the action context. */
export interface EnforceView {
	ok: boolean;
	snapshot?: EnforceSnapshot;
	source?: Source;
	error?: string;
}

/** The PROMOTE control result: the Go-authoritative (or demo) computed level. */
export interface PromoteView {
	ok: boolean;
	snapshot?: PromoteSnapshot;
	source?: Source;
	error?: string;
}

/** The initial (pre-submit) view states the panel seeds useActionState with. */
export const emptyEnforceView: EnforceView = { ok: false };
export const emptyPromoteView: PromoteView = { ok: false };
