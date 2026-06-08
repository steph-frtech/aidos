"use server";

import {
	DEFAULT_THRESHOLDS,
	type Driver,
	decide,
	type Measurement,
} from "@/lib/doltgres-spike";
import type { DecideView } from "./view";

/**
 * Server Action for the /doltgres-spike Workbench panel (S88 — go/no-go spike,
 * ADR 0006 addendum 0047).
 *
 * THE STEP (ROADMAP-app-builder S88): a gating spike judges Doltgres under N
 * concurrent connections + load against DECLARED thresholds → a content-addressed
 * Decision (verdict, default target, opt-in set). plain-Postgres is the DEFAULT by
 * construction; Doltgres is opt-in iff Go.
 *
 * DETERMINISM-FIRST (CLAUDE.md §6/§8): the verdict is a PURE function (lib/doltgres-
 * spike) — a count + two comparisons, never an LLM. Verdict = measure. THE WALL
 * (§2): it WRITES NOTHING — the Decision is a record, not a kernel write.
 *
 * A "use server" module may ONLY export async functions, so the view types +
 * initial value live in ./view (imported by both the action and the panel).
 */

/**
 * decideAction is the action-capable control (CLAUDE.md §7 ui-completeness): the
 * user supplies a Measurement (driver, N conns, failed conns, perf ratio,
 * reproducible) and runs the verdict — the action computes the Decision
 * deterministically over the DECLARED thresholds and content-addresses it. It
 * WRITES NOTHING (the wall).
 */
export async function decideAction(
	_prev: DecideView,
	formData: FormData,
): Promise<DecideView> {
	const driver = String(formData.get("driver") ?? "ts-postgres") as Driver;
	const conns = clampInt(formData.get("conns"), 64, 1, 1024);
	const failedConns = clampInt(formData.get("failedConns"), 0, 0, conns);
	const perfRatio = clampFloat(formData.get("perfRatio"), 0.3, 0, 100);
	const reproducible = formData.get("reproducible") === "on";

	const m: Measurement = {
		driver,
		conns,
		failedConns,
		perfRatio,
		reproducible,
	};
	const decision = await decide(m, DEFAULT_THRESHOLDS);
	return { ok: true, decision };
}

function clampInt(
	v: FormDataEntryValue | null,
	def: number,
	lo: number,
	hi: number,
): number {
	const n = Number.parseInt(String(v ?? ""), 10);
	if (Number.isNaN(n)) return def;
	return Math.min(Math.max(n, lo), hi);
}

function clampFloat(
	v: FormDataEntryValue | null,
	def: number,
	lo: number,
	hi: number,
): number {
	const n = Number.parseFloat(String(v ?? ""));
	if (Number.isNaN(n)) return def;
	return Math.min(Math.max(n, lo), hi);
}
