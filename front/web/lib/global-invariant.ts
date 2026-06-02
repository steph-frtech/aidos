/**
 * The GlobalInvariant projection — the Workbench /global-invariants source (AIDOS step S48).
 *
 * KRD §49.1 (GlobalInvariant — "un invariant transverse est une exception coûteuse, pas le
 * mode normal"): a GlobalInvariant is a truth that spans MORE THAN ONE cell (bounded context)
 * — distinct from the per-truth TruthScope (S15) that scopes a SINGLE truth's reach. It
 * declares three FROZEN §49.1 enums: scope ∈ {local_cell, contract_pair, federation_policy},
 * blast_radius ∈ {small, bounded, global}, approval_required ∈ {cell_owner,
 * both_contract_owners, architecture_owner}.
 *
 * This module is the DECLARED projection of the Go package back/kernel/globalinvariant — the
 * same §49.1 shape, the same two laws: (1) RedWave reddens EVERY cell in the invariant's reach
 * on a cross-cell violation (the §49 fan-out, never just the violator); (2) Admit blocks when
 * the granted approval is narrower than the blast_radius demands (global ⇒ architecture_owner).
 * One source, no drift.
 *
 * DETERMINISM-FIRST (CLAUDE.md §6/§8): pure functions over their input — no clock, no rng, no
 * I/O — so the same input always yields the same output. The reproducibility mirror
 * lib/global-invariant.test.ts (fast-check) pins the red-wave fan-out, the monotone-in-radius
 * admission, totality, and determinism.
 *
 * READ-ONLY (CLAUDE.md §7 ui-completeness): /global-invariants renders the decider's verdict;
 * it never writes truth (the wall). Truth-writes — declaring or re-scoping a GlobalInvariant —
 * go via propose → ChangeSet → approval (SemanticDiff change_type `rescope` for scope/cells,
 * `reweight` for blast_radius, `reauthorize` for approval_required, KRD §44.1), never from the
 * screen.
 */

/** The three FROZEN KRD §49.1 scopes — how many cells the invariant crosses. */
export const SCOPES = [
	"local_cell",
	"contract_pair",
	"federation_policy",
] as const;
export type Scope = (typeof SCOPES)[number];

/** The three FROZEN KRD §49.1 blast radii (ascending) — how far a violation propagates. */
export const BLAST_RADII = ["small", "bounded", "global"] as const;
export type BlastRadius = (typeof BLAST_RADII)[number];

/** The three FROZEN KRD §49.1 authority tiers (ascending) — the tier admission demands. */
export const AUTHORITIES = [
	"cell_owner",
	"both_contract_owners",
	"architecture_owner",
] as const;
export type Authority = (typeof AUTHORITIES)[number];

/** A reference to a cell (bounded context) the invariant spans. */
export type CellRef = string;

/** The KRD §49.1 GlobalInvariant AST. */
export interface GlobalInvariant {
	name: string;
	scope: Scope;
	cells: CellRef[];
	predicate: string;
	blastRadius: BlastRadius;
	approvalRequired: Authority;
}

/** The §49.1 + §44.5 refusal code carried by a blocked admission. */
export const CODE_INSUFFICIENT_APPROVAL =
	"INSUFFICIENT_APPROVAL_FOR_BLAST_RADIUS";

/** The actionable refusal (KRD §44.5: code, severity, explanation, how_to_fix[]). */
export interface BlockReason {
	code: string;
	severity: string;
	explanation: string;
	howToFix: string[];
}

/** The admission verdict — exactly one of three (KRD §49.1). */
export type Decision = "admitted" | "blocked" | "escalated";

export interface AdmissionDecision {
	decision: Decision;
	blockReason?: BlockReason;
	escalatedTo?: string[];
}

const authorityOrder: Record<Authority, number> = {
	cell_owner: 0,
	both_contract_owners: 1,
	architecture_owner: 2,
};

export function isKnownScope(s: string): s is Scope {
	return (SCOPES as readonly string[]).includes(s);
}
export function isKnownBlastRadius(b: string): b is BlastRadius {
	return (BLAST_RADII as readonly string[]).includes(b);
}
export function isKnownAuthority(a: string): a is Authority {
	return (AUTHORITIES as readonly string[]).includes(a);
}

/**
 * The PRECEDENCE rule (DECLARED, never learned): blast_radius → minimum approval tier.
 *   global ⇒ architecture_owner ; bounded ⇒ both_contract_owners ; small ⇒ cell_owner.
 */
export function minAuthorityForRadius(b: BlastRadius): Authority {
	if (b === "global") return "architecture_owner";
	if (b === "bounded") return "both_contract_owners";
	return "cell_owner";
}

/** Validation error (empty string ⇒ valid). */
export function validate(gi: GlobalInvariant): string {
	if (!gi.name) return "globalinvariant: invariant has no name";
	if (!gi.predicate) return "globalinvariant: invariant has no predicate";
	if (!isKnownScope(gi.scope))
		return `globalinvariant: unknown scope ${gi.scope}`;
	if (!isKnownBlastRadius(gi.blastRadius))
		return `globalinvariant: unknown blast_radius ${gi.blastRadius}`;
	if (!isKnownAuthority(gi.approvalRequired))
		return `globalinvariant: unknown approval_required ${gi.approvalRequired}`;
	const distinct = new Set<CellRef>();
	for (const c of gi.cells) {
		if (!c) return "globalinvariant: malformed (empty) cell ref";
		distinct.add(c);
	}
	if (gi.scope !== "local_cell" && distinct.size < 2)
		return "globalinvariant: a contract_pair/federation_policy invariant must span ≥2 distinct cells";
	if (
		authorityOrder[gi.approvalRequired] <
		authorityOrder[minAuthorityForRadius(gi.blastRadius)]
	)
		return "globalinvariant: approval_required is narrower than blast_radius demands";
	return "";
}

/**
 * RedWave — the cross-cell fan-out (KRD §49). local_cell ⇒ exactly its one cell;
 * contract_pair / federation_policy ⇒ EVERY spanned cell (the violator is always red). The
 * cross-cell links are load-bearing by declaration (S19 weighted propagation), so the wave
 * crosses to every partner cell. Returns a deterministic sorted set.
 */
export function redWave(gi: GlobalInvariant, violatedCell: CellRef): CellRef[] {
	if (gi.scope === "local_cell") {
		return gi.cells.length > 0 ? [gi.cells[0]] : dedupSorted([violatedCell]);
	}
	const reach = [...gi.cells];
	if (violatedCell) reach.push(violatedCell);
	return dedupSorted(reach);
}

function dedupSorted(xs: CellRef[]): CellRef[] {
	return [...new Set(xs.filter((c) => c !== ""))].sort();
}

/**
 * Admit — the cross-cell admission gate (KRD §49.1): a wider blast_radius demands a wider
 * approval tier. granted ≥ required ⇒ admitted ; exactly one tier below ⇒ escalated ; ≥2 tiers
 * below (or out-of-enum) ⇒ blocked / INSUFFICIENT_APPROVAL_FOR_BLAST_RADIUS. Total,
 * deterministic, monotone in radius (global never admitted without architecture_owner).
 */
export function admit(
	gi: GlobalInvariant,
	grantedApproval: Authority,
): AdmissionDecision {
	const required = minAuthorityForRadius(gi.blastRadius);
	const grantedRank = isKnownAuthority(grantedApproval)
		? authorityOrder[grantedApproval]
		: -1;
	const requiredRank = authorityOrder[required];

	if (grantedRank >= requiredRank) return { decision: "admitted" };
	if (grantedRank === requiredRank - 1)
		return { decision: "escalated", escalatedTo: ["architecture_owner"] };
	return {
		decision: "blocked",
		blockReason: insufficientApprovalReason(
			gi.blastRadius,
			required,
			grantedApproval,
		),
	};
}

function insufficientApprovalReason(
	b: BlastRadius,
	required: Authority,
	granted: Authority,
): BlockReason {
	const howToFix =
		required === "architecture_owner"
			? ["escalate_to_architecture_owner", "narrow_the_blast_radius"]
			: [`escalate_to:${required}`, "narrow_the_blast_radius"];
	return {
		code: CODE_INSUFFICIENT_APPROVAL,
		severity: "blocking",
		explanation: `Un blast_radius « ${b} » exige l'autorité « ${required} » ; l'approbation accordée (« ${granted} ») est trop étroite. Un invariant transverse est une exception coûteuse (KRD §49.1) : un rayon plus large exige une autorité plus large. L'admission est bloquée.`,
		howToFix,
	};
}
