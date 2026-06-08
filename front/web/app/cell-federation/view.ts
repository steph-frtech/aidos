import type { BlockReason, Cell, CellContextPack } from "@/lib/cell-federation";

/**
 * View models for the /cell-federation panel (S100 — cell federation). Kept OUT of actions.ts
 * because a Next "use server" module may only export async functions — types and initial
 * values live here so both the Server Actions and the client panel import them.
 */
export interface PartitionView {
	ok: boolean;
	cells?: Cell[];
	shippable?: string[];
	error?: string;
}

export interface PackView {
	ok: boolean;
	pack?: CellContextPack;
	/** whether the pack leaked any neighbor internal (code-judged; must always be false). */
	leaked?: boolean;
}

export interface AccessView {
	ok: boolean;
	allowed?: boolean;
	block?: BlockReason;
}

export const PARTITION_INITIAL: PartitionView = { ok: false };
export const PACK_INITIAL: PackView = { ok: false };
export const ACCESS_INITIAL: AccessView = { ok: false };
