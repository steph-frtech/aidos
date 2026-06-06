/**
 * lib/besoin-metadata.ts — the TYPESCRIPT TWIN of EL04's CertifyMetadata
 * (back/runtime/besoin/metadata.go). Pure, total, deterministic: same node + same metadata → same
 * verdict; no clock/rng/IO/LLM (determinism-first, CLAUDE.md §6/§8). The /compound-besoin-metadata
 * panel reads this twin so the verdict shown on screen is the SAME the Go authority computes, reusing
 * the logic of the THREE kernel packages (truthtyping/scope/authority) — never a fork.
 *
 * THE FOUR PER-TRUTH METADATA, each from its owning package:
 *   - truth_kind + verifiability (+ derived allowed_mode) ← truthtyping (7 kinds, 5 levels, 4 modes).
 *     truth_kind is the SINGLE canonical enum (authority delegates membership to it).
 *   - scope ← scope (regions/targets/segments/environments + explicit global "*").
 *   - authority ← authority (regulatory-without-legal done case).
 *
 * THE WALL (CLAUDE.md §2): this writes nothing above the line. The /spike routing is advisory: an
 * unverifiable node must travel idea_capture(draft) → idea_grill → idea_spike, never a direct capture
 * in "spiking". A LevelNode still carries NO version and NO mirror (the double absence, EL03).
 */

// --- truthtyping twin (the 7 kinds, 5 levels, 4 allowed-modes; KRD §13.4–13.5) ---

export const TRUTH_KINDS = [
	"behavioral",
	"structural",
	"experiential",
	"economic",
	"regulatory",
	"statistical",
	"exploratory",
] as const;
export type TruthKind = (typeof TRUTH_KINDS)[number];
export function isKnownKind(k: string): k is TruthKind {
	return (TRUTH_KINDS as readonly string[]).includes(k);
}

export const VERIFIABILITY_LEVELS = [
	"deterministic",
	"statistical",
	"delayed",
	"human_judged",
	"unverifiable",
] as const;
export type VerifiabilityLevel = (typeof VERIFIABILITY_LEVELS)[number];
export function isKnownLevel(l: string): l is VerifiabilityLevel {
	return (VERIFIABILITY_LEVELS as readonly string[]).includes(l);
}

export type AllowedMode = "kernel" | "experiment" | "spike" | "manual_review";
export type Zone =
	| "kernel"
	| "/spike"
	| "experiment"
	| "manual_review"
	| "rejected";

// allowedMode mirrors truthtyping.allowedMode (the DECLARED §13.5 rule, never learned).
const ALLOWED_MODE: Record<VerifiabilityLevel, AllowedMode> = {
	deterministic: "kernel",
	statistical: "experiment",
	delayed: "spike",
	human_judged: "manual_review",
	unverifiable: "spike",
};

function zoneForMode(m: AllowedMode): Zone {
	switch (m) {
		case "kernel":
			return "kernel";
		case "experiment":
			return "experiment";
		case "manual_review":
			return "manual_review";
		default:
			return "/spike";
	}
}

// classifyZone mirrors truthtyping.Classify's zone (only consulted when both kind and level known).
function classifyZone(level: VerifiabilityLevel): Zone {
	return zoneForMode(ALLOWED_MODE[level]);
}

// --- scope twin (regions/targets/segments/environments; KRD §13.7) ---

export const REGIONS = ["FR", "EU", "US", "*"] as const;
export type Region = (typeof REGIONS)[number];
export function isKnownRegion(r: string): r is Region {
	return (REGIONS as readonly string[]).includes(r);
}

export interface TruthScope {
	region?: string;
	tenant?: string;
	target?: string;
	userSegment?: string;
	environment?: string;
}

export function scopeIsEmpty(s: TruthScope): boolean {
	return (
		!s.region && !s.tenant && !s.target && !s.userSegment && !s.environment
	);
}
export function scopeIsGlobal(s: TruthScope): boolean {
	return s.region === "*";
}

// --- authority twin (regulatory-without-legal done case; KRD §13.8) ---

export interface AuthorityGraph {
	domain: string;
	truthKind: string;
	approvers: string[];
	veto?: string[];
	escalation?: string[];
}

export interface Metadata {
	truthKind?: string;
	verifiability?: string;
	scope?: TruthScope;
	authority?: AuthorityGraph;
	granted?: string[];
}

export type NodeStatus = "empty" | "drafting" | "resolved";

export type MetaCode =
	| "missing-truth-kind"
	| "unknown-truth-kind"
	| "missing-verifiability"
	| "unknown-verifiability"
	| "missing-scope"
	| "malformed-scope"
	| "missing-authority-approval"
	| "malformed-authority";

export interface MetaGap {
	code: MetaCode;
	field: "truth_kind" | "verifiability" | "scope" | "authority";
	explanation: string;
	howToFix: string[];
}

export interface MetadataVerdict {
	complete: boolean;
	gaps: MetaGap[];
	routing?: Zone;
	routeToSpike: boolean;
}

function isActiveForScope(status: NodeStatus): boolean {
	return status === "resolved" || status === "drafting";
}
function kindNeedsAuthority(k: string): boolean {
	return k === "regulatory";
}

// certifyMetadata is the byte-for-byte twin of CertifyMetadata in metadata.go. Deterministic order of
// checks: truth_kind → verifiability → scope → authority. Pure, total.
export function certifyMetadata(
	status: NodeStatus,
	m: Metadata,
): MetadataVerdict {
	const gaps: MetaGap[] = [];
	let routing: Zone | undefined;
	let routeToSpike = false;

	const kind = m.truthKind ?? "";
	const verif = m.verifiability ?? "";

	// 1. truth_kind
	if (kind === "") {
		gaps.push({
			code: "missing-truth-kind",
			field: "truth_kind",
			explanation:
				"Le nœud ne déclare aucun type de vérité épistémique (truthtyping §13.4).",
			howToFix: ["declare_truth_kind"],
		});
	} else if (!isKnownKind(kind)) {
		gaps.push({
			code: "unknown-truth-kind",
			field: "truth_kind",
			explanation: `truth_kind ${JSON.stringify(kind)} hors des sept membres §13.4.`,
			howToFix: ["use_known_truth_kind"],
		});
	}

	// 2. verifiability
	if (verif === "") {
		gaps.push({
			code: "missing-verifiability",
			field: "verifiability",
			explanation: "Le nœud ne déclare aucun niveau de vérifiabilité (§13.5).",
			howToFix: ["declare_verifiability"],
		});
	} else if (!isKnownLevel(verif)) {
		gaps.push({
			code: "unknown-verifiability",
			field: "verifiability",
			explanation: `verifiability ${JSON.stringify(verif)} hors des cinq membres §13.5.`,
			howToFix: ["use_known_verifiability"],
		});
	} else if (isKnownKind(kind)) {
		routing = classifyZone(verif);
		routeToSpike = routing === "/spike";
	}

	// 3. scope — the active-truth rule reused for the NEED.
	const scope = m.scope ?? {};
	if (isActiveForScope(status) && !scopeIsGlobal(scope)) {
		if (scopeIsEmpty(scope)) {
			gaps.push({
				code: "missing-scope",
				field: "scope",
				explanation:
					'Un nœud actif doit porter un TruthScope (region/target/segment/env) ou être explicitement global (region "*").',
				howToFix: ["declare_scope", "or_set_region_global"],
			});
		} else if (scope.region && !isKnownRegion(scope.region)) {
			gaps.push({
				code: "malformed-scope",
				field: "scope",
				explanation: `scope: unknown region ${JSON.stringify(scope.region)} (want FR|EU|US|*)`,
				howToFix: ["fix_scope_dimension"],
			});
		}
	}

	// 4. authority — only for kinds that need it (regulatory reuses the done case).
	if (kindNeedsAuthority(kind)) {
		if (!m.authority) {
			gaps.push({
				code: "missing-authority-approval",
				field: "authority",
				explanation:
					"Une vérité réglementaire sans autorité juridique explicite est incomplète (AuthorityGraph §13.8).",
				howToFix: ["assign_authority", "obtain_legal_approval"],
			});
		} else {
			const a = m.authority;
			const malformed =
				!a.domain || !isKnownKind(a.truthKind) || a.approvers.length === 0;
			if (malformed) {
				gaps.push({
					code: "malformed-authority",
					field: "authority",
					explanation:
						"authority: graph is ill-formed (domain/truth_kind/approvers)",
					howToFix: ["fix_authority_graph"],
				});
			} else {
				const granted = m.granted ?? [];
				const grantedApprovers = a.approvers.filter((ap) =>
					granted.includes(ap),
				).length;
				if (grantedApprovers === 0) {
					gaps.push({
						code: "missing-authority-approval",
						field: "authority",
						explanation:
							"L'autorité ne peut admettre la vérité : approbation requise manquante (authority.Decide §13.8).",
						howToFix: ["assign_authority", "obtain_legal_approval"],
					});
				}
			}
		}
	}

	return { complete: gaps.length === 0, gaps, routing, routeToSpike };
}

// truthKindIsCoherent: truth_kind is a SINGLE enum source — the twin carries exactly ONE TRUTH_KINDS
// constant (mirroring Go where authority delegates membership to truthtyping). Membership of a value
// in TRUTH_KINDS is the only source; the property asserts the constant equals the canonical seven and
// nothing forks it. Pure, total.
export function truthKindIsCoherent(
	canonicalKinds: readonly string[],
): boolean {
	if (TRUTH_KINDS.length !== canonicalKinds.length) return false;
	return TRUTH_KINDS.every((k, i) => k === canonicalKinds[i]);
}
