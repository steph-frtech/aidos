"use server";

import {
	type Environment,
	emittedAppHash,
	isBlocked,
	type PhaseInput,
	promote,
	rollback,
	rollbackProducesReProjection,
} from "@/lib/env-rollback";
import type { PromoteView, RollbackView } from "./view";

/**
 * Server Actions for the /env-rollback Workbench panel (S98 — environments + rollback-to-phase,
 * app-builder EPIC 10, DP28 / ADR 0043).
 *
 * THE STEP: promote a STABLE phase into an environment (preview→staging→prod), then ROLLBACK an
 * environment to an EARLIER stable phase = a DETERMINISTIC RE-PROJECTION of N-1 (S78), never a
 * restore of a stale sandbox artifact (CLAUDE.md §9). The decision is provenanced, append-only.
 *
 * DETERMINISM-FIRST (CLAUDE.md §6/§8): promote + rollback are PURE functions of the input
 * (lib/env-rollback) — same input → byte-identical record, never an LLM. The re-projection
 * equality is code-judged. THE WALL (§2/§9): a rollback is a RECORDED DECISION, not a write-to-
 * kernel — the screen proposes it as a ChangeSet for approval, never a direct write.
 */

// A STABLE phase verdict for a given phase hash + surface tag (the modelled current head).
function stablePhase(
	phaseHash: string,
	tag: string,
	project: string,
): PhaseInput {
	return {
		phase: { phaseHash, stable: true, reasons: [] },
		gate: { mutationScore: 0.9, mutationThreshold: 0.8, monsterCount: 0 },
		surface: {
			project,
			serverBundleHash: `srv-${tag}`,
			frontBundleHash: `fnt-${tag}`,
			infraHash: `inf-${tag}`,
			datastoreHash: `dst-${tag}`,
		},
	};
}

function redPhase(phaseHash: string, tag: string, project: string): PhaseInput {
	const p = stablePhase(phaseHash, tag, project);
	p.phase = { phaseHash, stable: false, reasons: ["createOrder.fixture"] };
	return p;
}

const KNOWN_ENVS: Environment[] = ["preview", "staging", "prod"];
function envOf(raw: string): Environment {
	return (KNOWN_ENVS as string[]).includes(raw) ? (raw as Environment) : "prod";
}

export async function promoteAction(
	_prev: PromoteView,
	formData: FormData,
): Promise<PromoteView> {
	const project = String(formData.get("project") ?? "").trim() || "shop";
	const env = envOf(String(formData.get("env") ?? "prod"));
	const phaseHash = String(formData.get("phaseHash") ?? "").trim() || "phase-n";
	const red = formData.get("red") === "on";
	// Optional custom domain to LINK to this env (S99/DP29); empty ⇒ the default deploy root.
	const domainRoot =
		String(formData.get("domainRoot") ?? "").trim() || undefined;

	const phase = red
		? redPhase(phaseHash, phaseHash, project)
		: stablePhase(phaseHash, phaseHash, project);

	const result = promote({ env, project, phase, domainRoot });
	if (isBlocked(result))
		return {
			ok: false,
			blockCode: result.code,
			blockExplanation: result.explanation,
		};
	return { ok: true, promotion: result };
}

export async function rollbackAction(
	_prev: RollbackView,
	formData: FormData,
): Promise<RollbackView> {
	const project = String(formData.get("project") ?? "").trim() || "shop";
	const env = envOf(String(formData.get("env") ?? "prod"));
	const currentHash =
		String(formData.get("currentHash") ?? "").trim() || "phase-n";
	const targetHash =
		String(formData.get("targetHash") ?? "").trim() || "phase-n-1";
	// Toggle: target the served phase (proves ROLLBACK_NOT_EARLIER).
	const same = formData.get("same") === "on";
	// Toggle: target a non-ancestor (proves ROLLBACK_NOT_EARLIER).
	const noAncestor = formData.get("noAncestor") === "on";
	const actor = String(formData.get("actor") ?? "").trim() || "human";
	const reason =
		String(formData.get("reason") ?? "").trim() || "incident in prod";

	const current = stablePhase(currentHash, currentHash, project);
	const target = same ? current : stablePhase(targetHash, targetHash, project);
	// The DAG lineage of the served phase: the target is an ancestor UNLESS the no-ancestor
	// toggle is set (then the lineage is empty ⇒ ROLLBACK_NOT_EARLIER).
	const lineage = same || noAncestor ? [] : [target.phase.phaseHash];

	const result = rollback({
		env,
		project,
		current,
		target,
		lineage,
		actor,
		reason,
	});
	if (isBlocked(result))
		return {
			ok: false,
			blockCode: result.code,
			blockExplanation: result.explanation,
		};

	// The re-projection property (code-judged): the env serves a FRESH re-emit of N-1, and the
	// STALE artifact of N is rejected.
	const fresh = emittedAppHash(target.phase.phaseHash, target.surface);
	const servesFresh = rollbackProducesReProjection(result, target, fresh);
	const stale = emittedAppHash(current.phase.phaseHash, current.surface);
	const rejectsStale =
		stale === fresh
			? false
			: !rollbackProducesReProjection(result, target, stale);

	return { ok: true, decision: result, servesFresh, rejectsStale };
}
