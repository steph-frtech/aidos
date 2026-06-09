/**
 * The /reality-evolution cockpit view state (S109 — Cockpit réalité & évolution par projet).
 *
 * The cockpit drives ONE primary control — closeReality (S106 ingest → S107 approve → red wave) —
 * plus the S108 QD elites archive's per-niche promotion control. The view is the discriminated
 * result the panel renders; both controls return pure values (the engines write no truth).
 */

import type { PromotionResult } from "@/lib/project-evolve";
import type { ClosureResult } from "@/lib/reality-evolution";

/** The reality→learn journey result (ingest + approve + red wave), or an error. */
export interface ClosureView {
	ok: boolean;
	result?: ClosureResult;
	error?: string;
}

export const CLOSURE_INITIAL: ClosureView = { ok: false };

/** The QD elite promotion result (a proposal or a refusal — never a truth-write). */
export interface PromotionView {
	ok: boolean;
	variantId?: string;
	result?: PromotionResult;
	error?: string;
}

export const PROMOTION_INITIAL: PromotionView = { ok: false };
