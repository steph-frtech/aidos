// Determinism-first twin of back/archive/projectevolve (S108, KRD §62/§64/§66) — the
// PER-PROJECT medium loop (`/evolve` + Quality-Diversity) run from a FIXED user mirror.
// PURE functions of their inputs — no clock, no rng, no I/O — so /project-evolve re-runs
// the SAME cull + niche-placement + promotion gate the Go package computes and renders
// the EXACT result. fast-check (lib/project-evolve.test.ts) pins the twin's invariants
// against the Go fixtures.
//
// THE WALL (CLAUDE.md §2/§8): the twin CULLS, PLACES and GATES — it writes no truth, opens
// no ChangeSet, governs nothing. A promotion is a PROPOSAL; the freeze is the human /goal.
// The Judge is the deterministic fixed mirror, never an LLM. "L'évolution explore, elle ne
// gouverne pas."

export type MirrorStatus = "green" | "red";
export type OutOfSampleStatus = "green" | "red";

export interface FixedMirror {
	projectId: string;
	mirrorId: string;
	behavior: string;
}

export interface Variant {
	projectId: string;
	id: string;
	niche: string;
	mirror: MirrorStatus;
	outOfSample: OutOfSampleStatus;
	fitness: number;
}

export interface CullResult {
	survivors: Variant[];
	killed: string[];
}

// cull is the pure twin of projectevolve.Cull: it runs the fixed mirror over every
// variant and KILLS the ones whose mirror is not green (truth-breakers), WHATEVER their
// fitness, and the ones from a foreign project. Total: any array yields a result.
export function cull(m: FixedMirror, variants: Variant[]): CullResult {
	const survivors: Variant[] = [];
	const killed: string[] = [];
	for (const v of variants) {
		if (v.projectId !== m.projectId) {
			killed.push(v.id);
			continue;
		}
		if (v.mirror !== "green") {
			killed.push(v.id);
			continue;
		}
		survivors.push(v);
	}
	killed.sort();
	return { survivors, killed };
}

// nicheKey is the pure twin of projectevolve.NicheKey: the project-prefixed descriptor so
// two projects' identical niches never collapse into one QD cell.
export function nicheKey(v: Variant): string {
	return `${v.projectId}::${v.niche}`;
}

// niches is the pure twin of projectevolve.Niches: it culls the mirror-breakers, then
// keeps ONE élite per project-scoped niche — the green survivor with the MAX anchored
// fitness, ties broken by the smaller id (deterministic, byte-stable). A mirror-breaker
// can never become an élite (the anti-Goodhart anchor).
export function niches(
	m: FixedMirror,
	variants: Variant[],
): Map<string, Variant> {
	const survivors = cull(m, variants).survivors;
	const out = new Map<string, Variant>();
	for (const v of survivors) {
		const key = nicheKey(v);
		const cur = out.get(key);
		if (
			!cur ||
			v.fitness > cur.fitness ||
			(v.fitness === cur.fitness && v.id < cur.id)
		) {
			out.set(key, v);
		}
	}
	return out;
}

export type PromotionVerdict = "proposed" | "refused";

export interface PromotionResult {
	verdict: PromotionVerdict;
	niche?: string;
	proposal: boolean;
	writesTruth: boolean;
	reason?: string;
	blockCode?: string;
}

// The single door a promotion must walk to become truth.
export const THE_GOAL_DOOR =
	"mirror_green ∧ out_of_sample_green ∧ authority_approval → /goal (human freeze)";

// promote is the pure twin of projectevolve.Promote: the per-project, authority-gated
// promotion. A foreign-project variant is refused (the S55 wall) BEFORE the gate. Then the
// three-condition binary gate — mirror_green ∧ out_of_sample_green ∧ authority_approval —
// a red-mirror variant refused WHATEVER its fitness; an out-of-sample-red variant refused
// (§87); without authority refused. A pass yields a PROPOSAL that writes no truth.
export function promote(
	m: FixedMirror,
	v: Variant,
	authorityApproved: boolean,
): PromotionResult {
	if (v.projectId !== m.projectId) {
		return {
			verdict: "refused",
			proposal: false,
			writesTruth: false,
			blockCode: "SANDBOX_ESCAPE",
			reason:
				"variante d'un autre projet — le mur S55 : jamais promue dans un projet étranger.",
		};
	}
	if (v.mirror !== "green") {
		return {
			verdict: "refused",
			proposal: false,
			writesTruth: false,
			reason:
				"miroir rouge — le Juge est le miroir déterministe, jamais le score (anti-Goodhart). Jamais promue, quel que soit le backtest.",
		};
	}
	if (v.outOfSample !== "green") {
		return {
			verdict: "refused",
			proposal: false,
			writesTruth: false,
			reason:
				"échec out-of-sample — le seul signal honnête (§87) ; on ne promeut jamais sur l'in-sample.",
		};
	}
	if (!authorityApproved) {
		return {
			verdict: "refused",
			proposal: false,
			writesTruth: false,
			reason:
				"autorité non approuvée — la promotion exige l'approbation de l'autorité (§66.1). L'IA propose, l'humain gèle.",
		};
	}
	return {
		verdict: "proposed",
		niche: nicheKey(v),
		proposal: true,
		writesTruth: false,
		reason: THE_GOAL_DOOR,
	};
}
