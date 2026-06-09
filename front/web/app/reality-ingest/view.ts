import type { DraftFromDivergence } from "@/lib/reality-ingest";

/**
 * View models for the /reality-ingest panel (S106 — boucle de réalité, EPIC 12 / E12). Kept OUT
 * of actions.ts because a Next "use server" module may only export async functions — types and
 * the initial value live here so both the Server Actions and the client panel import them.
 *
 * `diverged` distinguishes a healthy app (no draft, no idea invented) from a divergence that
 * produced a project-scoped RealityMirror + a DRAFT idea (provenance=incident, template text).
 */
export interface RealityIngestView {
	ok: boolean;
	/** true when an ingest ran and prod diverged; false on a healthy app or before any run. */
	diverged?: boolean;
	draft?: DraftFromDivergence;
	error?: string;
}

export const REALITY_INGEST_INITIAL: RealityIngestView = { ok: false };
