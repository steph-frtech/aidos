/**
 * projectWall.ts — the deterministic TS twin of back/runtime/projectwall (S55).
 *
 * S55 completes the multi-tenant isolation begun at S53/S54: the project-aware wall.
 * It is a two-layer defense-in-depth — a PreToolUse hook (level 1, the Go package
 * back/runtime/projectwall) AND Postgres RLS (level 2, project_rls_baseline.sql). A
 * below-the-line op that targets a project other than the active one, OR asserts a
 * forged identity, is refused with BlockReason AGENT_CROSS_PROJECT_WRITE.
 *
 * This module mirrors the Go classifier BYTE-FOR-BYTE:
 *  - VERDICTS are exactly {allow, deny};
 *  - CODE is "AGENT_CROSS_PROJECT_WRITE" — the same byte string the Go pins;
 *  - classify(scope, target) implements the SAME predicate as Go Classify:
 *      allow iff scope is non-zero AND the op's effective identity == scope.identity
 *               AND target.projectId == scope.activeProject;
 *      an unscoped target (no projectId) passes through (this wall governs project
 *      scope, the S04 waterline wall governs zone).
 *
 * IDENTITY-KEYED (S55 ⇄ S61): the active scope is (identity, project); a forged
 * gateway claim never widens it — the same predicate the RLS enforces.
 *
 * DETERMINISM-FIRST (CLAUDE.md §6): pure, same input → same output (pinned by the
 * Vitest+fast-check twin lib/projectWall.test.ts). The Go package is authoritative;
 * this twin must match it byte-for-byte. THE WALL: nothing here writes truth.
 */

export type Verdict = "allow" | "deny";

/** The one block code this wall emits — byte-identical to Go CodeAgentCrossProjectWrite. */
export const CODE_AGENT_CROSS_PROJECT_WRITE =
	"AGENT_CROSS_PROJECT_WRITE" as const;

export interface BlockReason {
	code: typeof CODE_AGENT_CROSS_PROJECT_WRITE;
	severity: "error";
	explanation: string;
	howToFix: string[];
}

export interface Decision {
	verdict: Verdict;
	blockReason?: BlockReason;
}

/** The active project scope — keyed on BOTH the propagated identity (S61) and the project. */
export interface Scope {
	identity: string;
	activeProject: string;
}

/** A below-the-line op's project target + the identity it asserts (empty ⇒ inherit scope). */
export interface Target {
	projectId: string;
	claimedIdentity?: string;
}

/** isZeroScope mirrors Go Scope.IsZero — empty identity or empty project ⇒ fail-closed. */
export function isZeroScope(s: Scope): boolean {
	return s.identity.trim() === "" || s.activeProject.trim() === "";
}

function crossProjectBlockReason(scope: Scope, target: Target): BlockReason {
	return {
		code: CODE_AGENT_CROSS_PROJECT_WRITE,
		severity: "error",
		explanation:
			`Refus du mur project-aware : l'opération vise le projet « ${target.projectId} » ` +
			`alors que le scope actif est (identité « ${scope.identity} », projet « ${scope.activeProject} »). ` +
			"L'agent ne lit/écrit below-the-line que pour le projet courant, sous sa propre identité propagée (S61).",
		howToFix: [
			"Basculez sur le projet visé via le project switcher (S57) avant d'agir.",
			"N'agissez que sous votre identité propagée — une réclamation forgée à la passerelle est refusée par la RLS (couche 2).",
			"Une opération inter-projets n'existe pas : chaque projet est une frontière de scope isolée.",
		],
	};
}

/**
 * classify mirrors Go projectwall.Classify exactly. Pure and total.
 *
 *   allow iff  scope non-zero
 *         AND  effective identity == scope.identity   (no forged claim)
 *         AND  target.projectId == scope.activeProject (no cross-project)
 *
 * An empty target.projectId is not project-scoped → allow (the waterline wall governs zone).
 */
export function classify(scope: Scope, target: Target): Decision {
	if (target.projectId.trim() === "") {
		return { verdict: "allow" };
	}
	if (isZeroScope(scope)) {
		return {
			verdict: "deny",
			blockReason: crossProjectBlockReason(scope, target),
		};
	}
	const claimed = (target.claimedIdentity ?? "").trim();
	if (claimed !== "" && claimed !== scope.identity.trim()) {
		return {
			verdict: "deny",
			blockReason: crossProjectBlockReason(scope, target),
		};
	}
	if (target.projectId.trim() !== scope.activeProject.trim()) {
		return {
			verdict: "deny",
			blockReason: crossProjectBlockReason(scope, target),
		};
	}
	return { verdict: "allow" };
}
