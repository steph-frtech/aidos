import type { Binding, Refusal } from "@/lib/environments";

/**
 * View types shared by the /environments Server Action and the panel (DP06 —
 * the per-environment connection bindings over the widened closed environment
 * set, ADR 0065). A "use server" module may only export async functions, so
 * these live here.
 */
export interface GateView {
	ok: boolean;
	/** the tested pair (environment, datastore) — echoed for the verdict line. */
	environment?: string;
	datastore?: string;
	/** the pair was admitted: the environment's declared binding. */
	binding?: Binding;
	/** the re-measured content address of the WHOLE projection. */
	hash?: string;
	/** whether the re-measured hash equals the Go-authoritative seeded one. */
	sameAsSeeded?: boolean;
	/** the pair was refused: the closed-code refusal (the A1 gate / unknown). */
	refusal?: Refusal;
}

export const GATE_INITIAL: GateView = { ok: false };
