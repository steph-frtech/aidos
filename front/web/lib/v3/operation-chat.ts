// biome-ignore-all lint/suspicious/noThenProperty: « then » est le terme Gherkin canonique (Given/When/Then) + le champ Then de step.go BranchStep, la langue ubiquitaire KRD — jamais une thenable.
/**
 * lib/v3/operation-chat.ts — le SOCLE PUR du chat A (NL → candidat), la TRANCHE 2 GATÉE
 * de l'autoring d'opération V3. C'est ici que vit la FRONTIÈRE DÉTERMINISTE : le LLM ne
 * produit qu'un CANDIDAT non fiable ; ce module le COERCE vers la forme FERMÉE TypedInputs,
 * puis lib/v3/operation.buildOperation (la PORTE AUTORITAIRE) le re-juge. Le LLM n'écrit
 * RIEN, ne décide RIEN — il propose, le code juge (CLAUDE.md §6/§8 determinism-first).
 *
 * CE QUI EST PUR ICI (aucun LLM n'entre dans ce fichier) :
 *   coerceCandidate(raw) → CandidateInputs|null : prend la sortie JSON du modèle (un blob
 *       UNTRUSTWORTHY) et la coerce vers la forme FERMÉE — name/input strings, steps[] de
 *       kind ∈ STEP_KINDS (les six verbes), champs propres au verbe coercés string,
 *       where/data acceptés comme TEXTE libre « clé = valeur » par ligne (l'éditeur B sait
 *       les parser). Une forme inattendue (steps non-array, kind absent…) ⇒ null : AUCUN
 *       prefill partiel, JAMAIS de devinette de champs.
 *   parsePairs(text) → objet plat : le MÊME parse que l'éditeur B (OperationAuthoringPanel),
 *       déterministe (ordre préservé). Le candidat porte where/data en texte ; build les
 *       voit en objet.
 *   candidateToTyped(c) → TypedInputs : projette le candidat coercé vers l'entrée typée que
 *       buildOperation consomme — la MÊME forme que l'éditeur typé produit. C'est l'unique
 *       jonction A→B : le candidat alimente l'éditeur, il ne le contourne pas.
 *
 * LA GRAMMAIRE EST FERMÉE. Le candidat ne peut porter que les six verbes (STEP_KINDS) et
 * les deux mutate ops (MUTATE_OPS) — mais ce module ne REJETTE pas un verbe inventé : il le
 * laisse passer en string, et buildOperation (l'AUTORITÉ) le refuse de façon TYPÉE
 * (UNKNOWN_STEP_KIND). La coercion garantit la FORME ; la grammaire est jugée par B. C'est
 * le contrat : LLM → candidat (coercé) → buildOperation(typed) — la ligne exacte de la
 * frontière déterministe.
 */

import {
	type BuildResult,
	buildOperation,
	type StepInput,
	type TypedInputs,
} from "./operation";

/**
 * CandidateStep — une étape telle que le LLM la PROPOSE (la forme close du contrat candidat).
 * Tous les champs sont optionnels et string : le candidat est UNTRUSTWORTHY, on ne lui fait
 * confiance sur AUCUN type. `where` / `data` sont du TEXTE « clé = valeur » par ligne (le LLM
 * peut proposer des paires libres ; l'éditeur B les parse). `kind` reste une string libre :
 * la grammaire fermée est jugée par buildOperation, pas devinée ici.
 */
export interface CandidateStep {
	readonly kind: string;
	readonly schema?: string;
	readonly policy?: string;
	readonly entity?: string;
	readonly op?: string;
	readonly as?: string;
	readonly cond?: string;
	readonly ref?: string;
	/** texte « clé = valeur » par ligne (parsé par B, jamais un objet libre du LLM). */
	readonly where?: string;
	/** texte « clé = valeur » par ligne (parsé par B). */
	readonly data?: string;
}

/**
 * CandidateInputs — le CONTRAT CANDIDAT que le LLM doit remplir (forme FERMÉE) : un nom, un
 * schéma d'input, une liste d'étapes (chacune un CandidateStep), les événements émis. C'est
 * une forme STRICTEMENT close — jamais un champ ouvert. Le LLM produit ce JSON ; coerceCandidate
 * le coerce ; candidateToTyped le projette en TypedInputs ; buildOperation le juge.
 */
export interface CandidateInputs {
	readonly name: string;
	readonly input: string;
	readonly steps: readonly CandidateStep[];
	readonly emits: readonly string[];
}

/** s — coerce une valeur inconnue en string (vide si absente / non-string). PURE & TOTALE. */
function s(v: unknown): string {
	return typeof v === "string" ? v : "";
}

/** isObject — un raw est-il un objet indexable (pas null, pas un tableau) ? */
function isObject(v: unknown): v is Record<string, unknown> {
	return typeof v === "object" && v !== null && !Array.isArray(v);
}

/**
 * coerceStep — coerce UN step candidat (untrusted) vers la forme close CandidateStep. PURE.
 * Tout champ présent est coercé string ; tout champ absent reste absent (buildOperation les
 * défaultera). `kind` reste libre (la grammaire est jugée par B). Renvoie null si le step
 * n'est même pas un objet (forme inattendue ⇒ aucun prefill partiel de cette étape).
 */
function coerceStep(raw: unknown): CandidateStep | null {
	if (!isObject(raw)) return null;
	const kind = s(raw.kind);
	// `where` / `data` : le LLM peut les proposer en TEXTE (« k = v » par ligne) OU en objet
	// (qu'on re-sérialise en texte pour l'éditeur B). On ne fait JAMAIS confiance à un objet
	// libre côté build : B le re-parse via parsePairs. Forme close, jamais un champ ouvert.
	const where = pairsText(raw.where);
	const data = pairsText(raw.data);
	return {
		kind,
		...(raw.schema !== undefined ? { schema: s(raw.schema) } : {}),
		...(raw.policy !== undefined ? { policy: s(raw.policy) } : {}),
		...(raw.entity !== undefined ? { entity: s(raw.entity) } : {}),
		...(raw.op !== undefined ? { op: s(raw.op) } : {}),
		...(raw.as !== undefined ? { as: s(raw.as) } : {}),
		...(raw.cond !== undefined ? { cond: s(raw.cond) } : {}),
		...(raw.ref !== undefined ? { ref: s(raw.ref) } : {}),
		...(where !== "" ? { where } : {}),
		...(data !== "" ? { data } : {}),
	};
}

/**
 * pairsText — normalise un where/data candidat en TEXTE « k = v » par ligne. PURE. Accepte
 * soit du texte (renvoyé tel quel), soit un objet plat (re-sérialisé « k = v » par ligne, clés
 * triées pour le déterminisme). Tout le reste (number, array…) ⇒ "" (aucune devinette).
 */
function pairsText(v: unknown): string {
	if (typeof v === "string") return v;
	if (isObject(v)) {
		return Object.keys(v)
			.sort()
			.map((k) => `${k} = ${s(v[k]) || String(v[k])}`)
			.join("\n");
	}
	return "";
}

/**
 * coerceCandidate — la JONCTION PURE entre la sortie LLM (untrusted) et la forme close. PURE.
 * Prend le JSON déjà parsé qu'a proposé le modèle ; renvoie un CandidateInputs coercé, ou
 * null si la forme est inexploitable (pas un objet, steps non-array). null ⇒ AUCUN prefill :
 * le candidat est JETÉ, jamais pré-rempli partiel. Le LLM n'a aucune autorité — au pire null.
 */
export function coerceCandidate(raw: unknown): CandidateInputs | null {
	if (!isObject(raw)) return null;
	if (!Array.isArray(raw.steps)) return null;
	const steps: CandidateStep[] = [];
	for (const st of raw.steps) {
		const cs = coerceStep(st);
		if (cs !== null) steps.push(cs);
	}
	const emits = Array.isArray(raw.emits)
		? raw.emits.map(s).filter((e) => e !== "")
		: [];
	return {
		name: s(raw.name),
		input: s(raw.input),
		steps,
		emits,
	};
}

/** parsePairs — « clé = valeur » par ligne → objet plat. Le MÊME parse que l'éditeur B. PURE. */
export function parsePairs(text: string): Record<string, string> {
	const out: Record<string, string> = {};
	for (const line of text.split("\n")) {
		const i = line.indexOf("=");
		if (i <= 0) continue;
		const k = line.slice(0, i).trim();
		const v = line.slice(i + 1).trim();
		if (k !== "") out[k] = v;
	}
	return out;
}

/**
 * candidateStepToInput — projette UN CandidateStep vers le StepInput typé. PURE. Réplique
 * EXACTEMENT toStepInput de l'éditeur B (où/data parsés via parsePairs) : le candidat alimente
 * l'éditeur, il en suit la grammaire. Un kind hors des six verbes reste {kind} — buildOperation
 * le refusera (UNKNOWN_STEP_KIND) : le code juge, le LLM ne décide pas.
 */
function candidateStepToInput(c: CandidateStep): StepInput {
	switch (c.kind) {
		case "validate":
			return { kind: "validate", schema: c.schema ?? "" };
		case "authorize":
			return { kind: "authorize", policy: c.policy ?? "" };
		case "read":
			return {
				kind: "read",
				entity: c.entity ?? "",
				where: parsePairs(c.where ?? ""),
				as: c.as ?? "",
			};
		case "mutate":
			return {
				kind: "mutate",
				entity: c.entity ?? "",
				op: c.op ?? "",
				data: parsePairs(c.data ?? ""),
				where: parsePairs(c.where ?? ""),
				as: c.as ?? "",
			};
		case "branch":
			return { kind: "branch", cond: c.cond ?? "", then: [], else: [] };
		case "return":
			return { kind: "return", ref: c.ref ?? "" };
		default:
			// Verbe hors grammaire fermée : on le laisse passer en string ; B le refuse.
			return { kind: c.kind };
	}
}

/**
 * candidateToTyped — projette un CandidateInputs coercé vers le TypedInputs que buildOperation
 * consomme — la MÊME forme que l'éditeur typé (B) produit. PURE. C'est l'unique jonction A→B :
 * le candidat ALIMENTE l'éditeur, il ne le contourne pas (l'utilisateur revoit/édite ensuite).
 */
export function candidateToTyped(c: CandidateInputs): TypedInputs {
	return {
		name: c.name,
		input: c.input,
		emits: [...c.emits],
		steps: c.steps.map(candidateStepToInput),
	};
}

/**
 * judgeCandidate — la PORTE AUTORITAIRE en un geste : coerce le candidat (untrusted) puis le
 * SOUMET à buildOperation (l'autorité de la grammaire fermée). PURE & DÉTERMINISTE. Renvoie le
 * verdict + le TypedInputs coercé (pour pré-remplir l'éditeur B même quand build refuse — afin
 * que l'utilisateur voie ce que le LLM a proposé ET les refus typés, jamais un prefill aveugle).
 *
 * C'EST LA FRONTIÈRE DÉTERMINISTE : LLM → coerceCandidate → buildOperation(typed). Le LLM ne
 * franchit jamais cette porte ; tout ce qui sort de la grammaire est {ok:false, errors:[…]}.
 */
export type JudgeResult =
	| { readonly kind: "malformed" }
	| {
			readonly kind: "judged";
			readonly typed: TypedInputs;
			readonly build: BuildResult;
	  };

export function judgeCandidate(raw: unknown): JudgeResult {
	const candidate = coerceCandidate(raw);
	if (candidate === null) return { kind: "malformed" };
	const typed = candidateToTyped(candidate);
	const build = buildOperation(typed);
	return { kind: "judged", typed, build };
}
