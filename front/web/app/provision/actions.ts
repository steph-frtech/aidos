"use server";

import {
	buildPlan,
	SAMPLE_ENTITY,
	SAMPLE_GO_DECISION,
	type Spec,
	type Target,
} from "@/lib/provision";
import type { PlanView } from "./view";

/**
 * Server Action for the /provision Workbench panel (S89 — per-app datastore
 * provisioning, app-builder EPIC 9, ADR 0006/0047, ADR 0043 DP15).
 *
 * THE STEP (ROADMAP-app-builder S89): provision the emitted app's datastore —
 * plain-Postgres DEFAULT (+pgvector sidecar iff needed), Doltgres OPT-IN iff the
 * S88 Decision is Go, SAME Atlas DDL emitter, per-project ISOLATION, migration
 * human-gated via DataTruthScope, emitted as a Pulumi resource (DP15).
 *
 * DETERMINISM-FIRST (CLAUDE.md §6/§8): the plan is a PURE function (lib/provision)
 * — a membership check + a hash + the existing DDL emitter, never an LLM. Same Spec
 * → byte-identical Plan. THE WALL (§2): it WRITES NOTHING — the Plan is a record.
 *
 * A "use server" module may ONLY export async functions, so the view types + initial
 * value live in ./view (imported by both the action and the panel).
 */

/**
 * planAction is the action-capable control (CLAUDE.md §7 ui-completeness): the user
 * picks a target (plain-postgres default / doltgres opt-in), toggles vector search,
 * and whether the change touches historical data with/without a declared migration —
 * then PLANS the datastore deterministically. The default-on-no-go and the human-gate
 * are enforced by the pure engine; the action surfaces the Plan or the BlockReason.
 */
export async function planAction(
	_prev: PlanView,
	formData: FormData,
): Promise<PlanView> {
	const projectId =
		String(formData.get("projectId") ?? "").trim() || "demo-app";
	const target = String(formData.get("target") ?? "plain-postgres") as
		| Target
		| "";
	const needsVector = formData.get("needsVector") === "on";
	const historical = formData.get("historical") === "on";
	const migrationDeclared = formData.get("migrationDeclared") === "on";

	const spec: Spec = {
		projectId,
		target,
		decision: SAMPLE_GO_DECISION,
		entities: [SAMPLE_ENTITY],
		needsVector,
		change: historical
			? {
					entity: SAMPLE_ENTITY.name,
					appliesTo: ["existing_records"],
					migrationDeclared,
				}
			: undefined,
	};

	const r = await buildPlan(spec);
	return { ok: r.ok, plan: r.plan, blockCode: r.blockCode };
}
