import type { EnvKV, Finding } from "@/lib/secret-store";

/**
 * View model for the /secret-store panel (S91). Kept OUT of actions.ts because a Next
 * "use server" module may only export async functions — types + the initial value live
 * here so both the Server Action and the client panel can import them.
 */
export interface SecretView {
	ok: boolean;
	/** the action that produced this view (set | rotate | inject | scan). */
	did?: string;
	/** a human note on the result (e.g. "secret posé", "rotation effectuée"). */
	message?: string;
	/** the project this view is scoped to. */
	project?: string;
	/** the SORTED secret names the project holds (never a value — leak-free). */
	keyNames?: string[];
	/** the boot-time env vars injected (VALUES masked in the UI — only the names show). */
	env?: EnvKV[];
	/** the leak scan findings over the emission (redacted excerpts). */
	findings?: Finding[];
	/** whether the scanned emission is clean of secrets. */
	clean?: boolean;
	/** the typed BlockReason explanation (a missing secret at boot, fail-closed). */
	blockExplanation?: string;
}

export const SECRET_INITIAL: SecretView = { ok: false };
