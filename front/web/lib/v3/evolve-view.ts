/**
 * V3 — le TWIN de la VUE « GÉNÉRATEUR D'ÉVOLUTION » (EG05, ROADMAP-evolve-generator,
 * ADR 0089). Une PROJECTION PURE d'un run d'évolution → les lignes affichables : pour
 * chaque cellule × choix de générateur, les variantes proposées (self-play vs
 * déterministe), leur niche, et le VERDICT DE GATE (passe → niche gagnée ; rouge →
 * motif). Le Go `back/runtime/evolve` reste LA RÉFÉRENCE ; ce twin est BYTE-COHÉRENT
 * avec lui — il rejoue EXACTEMENT les mêmes dérivations (deriveMirror / deriveOutOfSample
 * / deriveFitness / Promote / FixtureProposer / le sampler déterministe FallbackSampler)
 * et son sampler « self-play » est la version PURE/SEEDÉE (FixtureProposer) — JAMAIS
 * l'IA (ClaudeProposer reste côté Go, derrière le seam ; aucun appel réseau ici).
 *
 * DÉTERMINISME-FIRST (§6/§8) : tout est une fonction PURE de (cellule, graine) — pas
 * d'horloge, pas de Math.random, pas de réseau. Même entrée ⇒ même sortie. Le JUGE est
 * le miroir déterministe (Promote) : une variante au miroir rouge n'est JAMAIS promue,
 * quel que soit son score. Le générateur PROPOSE (niche + mutation) ; le gate DISPOSE.
 *
 * LE MUR (§2) : cette projection LIT et PROJETTE — aucune écriture kernel/mirrors/fitness.
 * Une promotion est une PROPOSITION ; le gel reste le /goal humain. Miroir : evolve-view.test.ts.
 */

// --- Le seuil de mutation et les constantes de dérivation (verbatim du Go) ----------

/** Au-delà, la mutation casse la fidélité → miroir ROUGE (Go deriveMirror : > 0.85). */
export const MIRROR_BREAK_MUTATION = 0.85;

// --- splitmix64 : le PRNG seedé, byte-identique au Go (proposers.go) ------------------

/**
 * splitmix64 — le PRNG seedé déterministe (aucun aléa ambiant, aucune horloge) : même
 * graine ⇒ même flux, exactement comme le Go `newSplitmix`/`next`/`float01`. Sur 64 bits
 * via BigInt (JS n'a pas d'entier 64 bits natif) — masqué à chaque pas pour rester
 * byte-cohérent avec l'arithmétique uint64 du Go. Les constantes passent par BigInt(…)
 * (jamais les littéraux `n`) pour rester compilables sous la cible tsconfig (ES2017).
 */
const U64 = BigInt("0xffffffffffffffff");
const GOLDEN = BigInt("0x9e3779b97f4a7c15");
const MUL1 = BigInt("0xbf58476d1ce4e5b9");
const MUL2 = BigInt("0x94d049bb133111eb");
const B30 = BigInt(30);
const B27 = BigInt(27);
const B31 = BigInt(31);
const B11 = BigInt(11);

class SplitMix64 {
	private s: bigint;
	constructor(seed: number) {
		// Go : uint64(seed) + 0x9E3779B97F4A7C15 — seed int64 → uint64 (wrap two's complement).
		this.s = ((BigInt(seed) & U64) + GOLDEN) & U64;
	}
	next(): bigint {
		this.s = (this.s + GOLDEN) & U64;
		let z = this.s;
		z = ((z ^ (z >> B30)) * MUL1) & U64;
		z = ((z ^ (z >> B27)) * MUL2) & U64;
		return (z ^ (z >> B31)) & U64;
	}
	/** float dans [0,1) — Go : float64(next()>>11) / float64(1<<53). */
	float01(): number {
		return Number(this.next() >> B11) / 2 ** 53;
	}
}

// --- La cellule + le run : l'entrée DÉCLARÉE (jamais apprise, §8) ---------------------

/** Le choix de générateur derrière le seam — self-play (seedé) vs déterministe (fallback). */
export type SamplerKind = "self-play" | "deterministe";

/** Le jeu CLOS et déclaré des générateurs (jamais deviné). */
export const SAMPLER_KINDS: readonly SamplerKind[] = [
	"self-play",
	"deterministe",
] as const;

/**
 * Une cellule de kernel sous /evolve — la vue plate que le sampler consomme (Go `Cell`,
 * selfplay.go) : ses niches DÉCLARÉES, le sous-ensemble que l'AUTORITÉ a approuvé, et
 * le plancher de fidélité out-of-sample (§87). CONSUMÉE en lecture seule.
 */
export interface EvolveCell {
	readonly id: string;
	readonly niches: readonly string[];
	readonly authorityApprovedNiches: readonly string[];
	readonly outOfSampleThreshold: number;
}

/** Le verdict de miroir — le Juge déterministe (Go MirrorStatus). */
export type MirrorStatus = "green" | "red";

/** Le verdict out-of-sample (§87) — le seul signal honnête (Go OutOfSampleStatus). */
export type OutOfSampleStatus = "green" | "red";

/** Le verdict du gate de promotion — passe (niche gagnée) ou refusé (avec motif). */
export type GateVerdict = "proposed" | "refused";

/** Le motif CLOS d'un refus de gate (jamais inventé) — mappé à une clé i18n côté écran. */
export type RefusalReason = "mirror" | "oos" | "authority" | null;

/** Une variante proposée + son verdict de gate projeté — UNE ligne affichable. */
export interface VariantRow {
	/** L'id de branche déterministe de la variante (sous /branches/evolution). */
	readonly id: string;
	/** La niche comportementale visée (descripteur S26 — déclaré, jamais appris). */
	readonly niche: string;
	/** La force de mutation [0,1] que le générateur a proposée. */
	readonly mutation: number;
	readonly mirror: MirrorStatus;
	readonly outOfSample: OutOfSampleStatus;
	/** L'autorité a-t-elle approuvé cette niche ? (lue du jeu approuvé de la cellule). */
	readonly authorityApproved: boolean;
	/** Le score de fitness — il ORDONNE dans une niche, il ne SURCHARGE jamais le gate. */
	readonly fitness: number;
	/** Le verdict du gate : passe (niche gagnée) ou refusé. */
	readonly verdict: GateVerdict;
	/** Le motif du refus (null si la variante passe) — jeu clos. */
	readonly refusal: RefusalReason;
}

/** La projection d'un run pour une cellule × un générateur. */
export interface CellRun {
	readonly cell: string;
	readonly sampler: SamplerKind;
	readonly seed: number;
	/** Les variantes proposées, triées (niche puis mutation) — ordre stable, rejouable. */
	readonly variants: readonly VariantRow[];
	/** Les niches GAGNÉES (gate passé) — distinctes, triées. */
	readonly nichesWon: readonly string[];
	/** Le nombre de niches distinctes gagnées (NicheCoverage du Go). */
	readonly coverage: number;
}

// --- Les dérivations cellule-side (le Juge — verbatim du Go selfplay.go) --------------

/** Go deriveMirror : mutation > 0.85 → ROUGE ; sinon VERT. PURE. */
function deriveMirror(mutation: number): MirrorStatus {
	return mutation > MIRROR_BREAK_MUTATION ? "red" : "green";
}

/** Go deriveOutOfSampleValue : 1 - 0.6*mutation, borné [0,1]. PURE. */
function deriveOutOfSampleValue(mutation: number): number {
	const v = 1 - 0.6 * mutation;
	if (v < 0) return 0;
	if (v > 1) return 1;
	return v;
}

/** Go deriveOutOfSample : vert ssi la valeur franchit le plancher déclaré. PURE. */
function deriveOutOfSample(
	cell: EvolveCell,
	mutation: number,
): OutOfSampleStatus {
	return deriveOutOfSampleValue(mutation) >= cell.outOfSampleThreshold
		? "green"
		: "red";
}

/** Go deriveFitness : 0.5 + 0.3*mutation*oosValue (diagnostique, ordonne seulement). PURE. */
function deriveFitness(mutation: number): number {
	return 0.5 + 0.3 * mutation * deriveOutOfSampleValue(mutation);
}

/** Une niche est-elle dans le jeu approuvé de l'autorité ? PURE. */
function authorityApproves(cell: EvolveCell, niche: string): boolean {
	return cell.authorityApprovedNiches.includes(niche);
}

// --- Le gate de promotion (Go Promote — le Juge déterministe, anti-Goodhart) ----------

/**
 * Promote — le gate BINAIRE (Go evolve.go). Une variante passe SSI les TROIS conditions
 * déclarées sont vraies : mirror_green ∧ out_of_sample_green ∧ authority_approval. Le
 * premier échec dans CET ORDRE donne le motif (byte-cohérent avec l'ordre des `if` du Go).
 * Une variante au miroir rouge n'est JAMAIS promue, quel que soit son score. PURE & TOTALE.
 */
export function promote(row: {
	readonly mirror: MirrorStatus;
	readonly outOfSample: OutOfSampleStatus;
	readonly authorityApproved: boolean;
}): { verdict: GateVerdict; refusal: RefusalReason } {
	if (row.mirror !== "green") return { verdict: "refused", refusal: "mirror" };
	if (row.outOfSample !== "green")
		return { verdict: "refused", refusal: "oos" };
	if (!row.authorityApproved)
		return { verdict: "refused", refusal: "authority" };
	return { verdict: "proposed", refusal: null };
}

// --- Les samplers : self-play (FixtureProposer, seedé) vs déterministe (Fallback) -----

/** Go proposalCount : borne le budget à la bande [5,8]. PURE. */
function proposalCount(budget: number): number {
	if (budget > 8) return 8;
	if (budget < 5) return 5;
	return budget;
}

/**
 * Le générateur self-play PUR (Go FixtureProposer) : étale `proposalCount(budget)`
 * candidats en round-robin sur les niches DÉCLARÉES, avec des forces de mutation seedées
 * VARIANTES dans [0.1, 0.95) — donc certaines variantes échouent légitimement le gate
 * (mutation > 0.85 → miroir rouge, ou sous le plancher). Le générateur n'invente JAMAIS
 * une niche. C'est la version SEEDÉE/HERMÉTIQUE — l'IA (ClaudeProposer) reste côté Go.
 */
function fixturePropose(
	cell: EvolveCell,
	budget: number,
	seed: number,
): { niche: string; mutation: number }[] {
	if (cell.niches.length === 0) return [];
	const n = proposalCount(budget);
	const r = new SplitMix64(seed);
	const out: { niche: string; mutation: number }[] = [];
	for (let i = 0; i < n; i++) {
		const niche = cell.niches[i % cell.niches.length];
		// Go : 0.1 + 0.85*float01() — surtout modeste, parfois audacieux.
		out.push({ niche, mutation: 0.1 + 0.85 * r.float01() });
	}
	return out;
}

/**
 * Le sampler DÉTERMINISTE (Go FallbackSampler) : un parent stable + UNE variante à
 * fitness verte sur la niche « <cell>/baseline » — non approuvée par l'autorité (donc
 * REFUSÉE au gate sur la condition d'autorité). C'est le repli figé du seam : pas de
 * round-robin, une seule proposition fixe. PURE.
 */
function deterministicPropose(
	cell: EvolveCell,
): { niche: string; mutation: number }[] {
	// FallbackSampler renvoie Niche=cell/baseline, evidence mirror+oos verts,
	// authority=false. On modélise une mutation modeste (oos vert) sur cette niche.
	return [{ niche: `${cell.id}/baseline`, mutation: 0.3 }];
}

// --- La projection : un run → ses lignes affichables ----------------------------------

/** L'id de branche déterministe (Go candidateVariantID : var-<cell>-sp<NN>). */
function variantId(cellId: string, sampler: SamplerKind, i: number): string {
	const prefix = sampler === "self-play" ? "sp" : "det";
	return `var-${cellId}-${prefix}${String(i).padStart(2, "0")}`;
}

/** Juge UNE proposition (niche + mutation) → une ligne complète. PURE. */
function judge(
	cell: EvolveCell,
	sampler: SamplerKind,
	i: number,
	prop: { niche: string; mutation: number },
): VariantRow {
	const mirror = deriveMirror(prop.mutation);
	const outOfSample = deriveOutOfSample(cell, prop.mutation);
	const authorityApproved = authorityApproves(cell, prop.niche);
	const { verdict, refusal } = promote({
		mirror,
		outOfSample,
		authorityApproved,
	});
	return {
		id: variantId(cell.id, sampler, i),
		niche: prop.niche,
		mutation: prop.mutation,
		mirror,
		outOfSample,
		authorityApproved,
		fitness: deriveFitness(prop.mutation),
		verdict,
		refusal,
	};
}

/**
 * projectCellRun — la PROJECTION PURE : run (cellule, générateur, budget, graine) → ses
 * lignes affichables (variantes + verdicts) + les niches gagnées + la couverture. Les
 * variantes sont TRIÉES (niche puis mutation) — l'ordre stable, byte-rejouable, exactement
 * comme le tri de NewSelfPlaySampler côté Go. PURE & TOTALE & DÉTERMINISTE.
 */
export function projectCellRun(
	cell: EvolveCell,
	sampler: SamplerKind,
	budget: number,
	seed: number,
): CellRun {
	const props =
		sampler === "self-play"
			? fixturePropose(cell, budget, seed)
			: deterministicPropose(cell);
	// Tri stable (niche puis mutation) — l'ordre rejouable du Go.
	const sorted = [...props].sort((a, b) =>
		a.niche !== b.niche
			? a.niche.localeCompare(b.niche)
			: a.mutation - b.mutation,
	);
	const variants = sorted.map((p, i) => judge(cell, sampler, i, p));
	const won = new Set<string>();
	for (const v of variants) if (v.verdict === "proposed") won.add(v.niche);
	const nichesWon = [...won].sort((a, b) => a.localeCompare(b));
	return {
		cell: cell.id,
		sampler,
		seed,
		variants,
		nichesWon,
		coverage: nichesWon.length,
	};
}

// --- La cellule canonique hermétique (le jeu déterministe de l'e2e, §6 IA coupée) -----

/**
 * La cellule CANONIQUE — le jeu HERMÉTIQUE que l'écran et l'e2e rejouent (aucun réseau).
 * Trois niches déclarées, deux approuvées par l'autorité (la friction réaliste : l'autorité
 * ne tamponne pas tout), un plancher out-of-sample à 0.55. DÉCLARÉE, jamais apprise (§8).
 */
export const CANONICAL_CELL: EvolveCell = {
	id: "createOrder",
	niches: ["createOrder/discount", "createOrder/refund", "createOrder/split"],
	authorityApprovedNiches: ["createOrder/discount", "createOrder/refund"],
	outOfSampleThreshold: 0.55,
};

/** La graine canonique du run (passée, jamais lue de l'ambiant — rejouable). */
export const CANONICAL_SEED = 42;
/** Le budget canonique (borné à la bande [5,8]). */
export const CANONICAL_BUDGET = 8;

/**
 * runCanonical — le run hermétique pour un générateur donné, sur la cellule canonique.
 * C'est ce que l'écran rejoue par défaut et ce que l'e2e prouve (IA coupée, jeu déterministe).
 */
export function runCanonical(sampler: SamplerKind): CellRun {
	return projectCellRun(
		CANONICAL_CELL,
		sampler,
		CANONICAL_BUDGET,
		CANONICAL_SEED,
	);
}

/** La clé i18n du libellé d'un motif de refus (jeu déclaré et clos). */
export function refusalLabelKey(refusal: RefusalReason): string {
	switch (refusal) {
		case "mirror":
			return "evolveRefusalMirror";
		case "oos":
			return "evolveRefusalOos";
		case "authority":
			return "evolveRefusalAuthority";
		case null:
			return "evolveVerdictProposed";
	}
}

/** La clé i18n du libellé d'un générateur (jeu déclaré et clos). */
export function samplerLabelKey(sampler: SamplerKind): string {
	return sampler === "self-play" ? "evolveSamplerSelfPlay" : "evolveSamplerDet";
}
