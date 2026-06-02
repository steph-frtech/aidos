// Determinism-first twin of back/runtime/evolve.Confine + Promote + Evolve (KRD
// §66.1, S42). PURE functions of their inputs — no clock, no rng, no I/O — so
// /evolution-sandbox can re-run the SAME classification + gate the Go package computes
// and render the EXACT quarantine ledger + promotion verdict. The three can_write
// zones, the four cannot_write zones, and the three-condition promotion gate mirror
// the Go package; fast-check (lib/evolution-sandbox.test.ts) pins the twin's invariants.
//
// THE WALL (CLAUDE.md §2/§8): the twin CLASSIFIES and GATES — it writes no truth, opens
// no ChangeSet, governs nothing. A promotion is a PROPOSAL; the freeze is the human
// /goal. "L'évolution explore, elle ne gouverne pas."

// The three can_write zones — exactly these (KRD §66.1, never a fourth).
export const CAN_WRITE = [
	"/branches/evolution",
	"/reports",
	"/ideas/proposed",
] as const;

// The four cannot_write zones — exactly these (KRD §66.1). The §66.1 cannot_write set
// IS the §2 wall.
export const CANNOT_WRITE = [
	"/kernel",
	"/mirrors/above",
	"/authority",
	"/fitness",
] as const;

// The single door a promotion must walk to become truth — the sandbox never bypasses it.
export const THE_GOAL_DOOR =
	"mirror_green ∧ out_of_sample_green ∧ authority_approval → /goal (human freeze)";

export const BLOCK_CODE_ESCAPE = "SANDBOX_WRITE_ESCAPES_ZONE";

export type ConfineVerdict = "allowed" | "refused";

export interface ConfineResult {
	verdict: ConfineVerdict;
	blockCode?: string;
	howToFix?: string[];
}

// underPrefix: path is exactly prefix or under "prefix/". Pure/total.
function underPrefix(path: string, prefix: string): boolean {
	if (path === prefix) return true;
	return path.startsWith(`${prefix}/`);
}

// confine is the pure twin of evolve.Confine: a path under a can_write prefix is
// Allowed; anything else (cannot_write OR outside can_write) is Refused with
// SANDBOX_WRITE_ESCAPES_ZONE. Fail-closed (the sandbox is an allow-list).
export function confine(path: string): ConfineResult {
	for (const p of CAN_WRITE) {
		if (underPrefix(path, p)) return { verdict: "allowed" };
	}
	return {
		verdict: "refused",
		blockCode: BLOCK_CODE_ESCAPE,
		howToFix: [
			"confine_write_to_/branches/evolution_or_/reports_or_/ideas/proposed",
			"open_a_/goal_to_promote_a_candidate",
		],
	};
}

export type MirrorStatus = "green" | "red";
export type OutOfSampleStatus = "green" | "red";

export interface Evidence {
	mirror: MirrorStatus;
	outOfSample: OutOfSampleStatus;
	authorityApproved: boolean;
	fitness: number;
}

export type PromotionVerdict = "proposed" | "refused";

export interface PromotionProposal {
	variantId: string;
	niche: string;
	proposal: true;
	writesTruth: false;
	requiresGoal: string;
}

export interface PromotionResult {
	verdict: PromotionVerdict;
	proposal?: PromotionProposal;
	reason?: string;
}

// promote is the pure twin of evolve.Promote: the BINARY gate — a variant is promoted
// ONLY IF mirror_green ∧ out_of_sample_green ∧ authority_approval. A red-mirror variant
// is refused WHATEVER its fitness (the anti-Goodhart anchor — the Judge is the mirror,
// never the score). A mirror-green-but-out-of-sample-red variant is refused (§87). A
// pass yields a PROPOSAL that writes no truth.
export function promote(
	variantId: string,
	niche: string,
	e: Evidence,
): PromotionResult {
	if (e.mirror !== "green") {
		return {
			verdict: "refused",
			reason:
				"miroir rouge — le Juge est le miroir déterministe, jamais le score (anti-Goodhart). Jamais promu, quel que soit le backtest.",
		};
	}
	if (e.outOfSample !== "green") {
		return {
			verdict: "refused",
			reason:
				"échec out-of-sample — le seul signal honnête (§87) ; on ne promeut jamais sur l'in-sample.",
		};
	}
	if (!e.authorityApproved) {
		return {
			verdict: "refused",
			reason:
				"autorité non approuvée — la promotion exige l'approbation de l'autorité (§66.1). L'IA propose, l'humain gèle.",
		};
	}
	return {
		verdict: "proposed",
		proposal: {
			variantId,
			niche,
			proposal: true,
			writesTruth: false,
			requiresGoal: THE_GOAL_DOOR,
		},
	};
}

// gateLit reports the three promotion pills' lit/unlit state for a variant's evidence.
export function gateLit(e: Evidence): {
	mirrorGreen: boolean;
	outOfSampleGreen: boolean;
	authorityApproval: boolean;
	promotable: boolean;
} {
	const mirrorGreen = e.mirror === "green";
	const outOfSampleGreen = e.outOfSample === "green";
	const authorityApproval = e.authorityApproved;
	return {
		mirrorGreen,
		outOfSampleGreen,
		authorityApproval,
		promotable: mirrorGreen && outOfSampleGreen && authorityApproval,
	};
}
