"use server";

import { execFile } from "node:child_process";
import { promisify } from "node:util";
import {
	type BuildError,
	MUTATE_OPS,
	STEP_KINDS,
	type TypedInputs,
} from "../../../lib/v3/operation";
import { judgeCandidate } from "../../../lib/v3/operation-chat";

const execFileP = promisify(execFile);

/**
 * chat-actions.ts — le CHAT A de l'autoring d'opération V3 (NL → candidat), la TRANCHE 2
 * GATÉE. L'utilisateur DÉCRIT en langage naturel l'opération qu'il veut ; le LLM (l'EXCEPTION
 * GATÉE, CLAUDE.md §6/§8) propose un CANDIDAT structuré ; le code (lib/v3/operation-chat +
 * buildOperation) le JUGE et n'en alimente l'éditeur typé (B) que s'il franchit la grammaire
 * fermée. Le LLM ne décide RIEN, n'écrit RIEN.
 *
 * LA FRONTIÈRE DÉTERMINISTE (l'invariant de ce fichier) :
 *   proposeFromText(nl, …) →
 *     1. appelle le LLM avec la GRAMMAIRE FERMÉE en contexte (les six verbes, les deux mutate
 *        ops, les entités/policies/events du projet) + DEMANDE un JSON candidat (le contrat) ;
 *     2. PARSE le JSON (rejet TYPÉ « malformed » si illisible) ;
 *     3. JUGE le candidat par judgeCandidate = coerceCandidate (forme close) → buildOperation
 *        (l'AUTORITÉ : refuse tout verbe/champ hors grammaire de façon TYPÉE) ;
 *     4. renvoie SOIT l'AST validé + le TypedInputs (pour pré-remplir B), SOIT les refus typés
 *        À L'ÉCRAN — le candidat hors-grammaire est JETÉ, jamais pré-rempli invalide silencieux.
 *
 * LE MUR (§2) : aucune écriture-vérité ici. proposeFromText ne fait que PROPOSER un AST à
 * pré-remplir dans l'éditeur (B) ; l'utilisateur revoit/édite, ajoute le miroir (C), puis
 * « Proposer » (proposeOperationAction, inchangé) dérive l'idée via idea_capture. Le chat ne
 * contourne NI B NI C — il les alimente. La porte miroir C et la re-validation serveur de
 * proposeOperationAction restent les juges finaux ; ce chat ne fait qu'un raccourci de saisie.
 *
 * DÉTERMINISME-FIRST : tout le jugement (coerce + build) est PUR ; le LLM est confiné au seul
 * NL→JSON, son output re-vérifié. L'appel LLM réutilise le pattern PROUVÉ (app/v3/actions.ts ::
 * chatTurnAction, app/v2/builder/actions.ts) : execFileP(CLAUDE_BIN, [-p, prompt, --model,
 * AIDOS_LLM_MODEL, --output-format json, --max-turns 1]). Toute panne → repli déterministe
 * (kind:"llmUnavailable") : aucun prefill, l'éditeur typé (B) reste l'unique chemin sûr.
 */

/** Le binaire Claude Code derrière le chat (même précédent que /ai-lab, /v3, /v2/builder). */
const CLAUDE_BIN =
	process.env.AIDOS_CLAUDE_BIN || "/home/stevig/.local/bin/claude";

/** Extrait l'objet JSON d'une réponse de modèle qui peut porter de la prose / des fences. */
function extractJson(text: string): string {
	const a = text.indexOf("{");
	const b = text.lastIndexOf("}");
	return a >= 0 && b > a ? text.slice(a, b + 1) : "";
}

/** La grammaire close, présentée au LLM comme un contexte de proposition (jamais une autorité). */
export interface OperationGrammar {
	readonly entities: readonly string[];
	readonly policies: readonly string[];
	readonly events: readonly string[];
}

/**
 * candidatePrompt — le prompt qui présente la GRAMMAIRE FERMÉE au LLM et DEMANDE le JSON
 * candidat (le contrat CandidateInputs). Le LLM est explicitement informé qu'il PROPOSE
 * (le code re-juge) : il ne doit produire QUE le JSON de la forme close. Les entités/policies/
 * events du projet sont des PISTES (le candidat reste re-jugé par buildOperation).
 */
function candidatePrompt(nl: string, grammar: OperationGrammar): string {
	return [
		"Tu assistes l'autoring d'opération d'AIDOS V3 : l'utilisateur décrit en langage naturel une OPÉRATION (une vérité N2 Workflow) ; tu PROPOSES un brouillon structuré que le code re-jugera.",
		"La grammaire est FERMÉE. Une opération a un nom, un schéma d'input, une liste d'ÉTAPES, et des ÉVÉNEMENTS émis.",
		`Les SEULS verbes d'étape autorisés (kind) : ${STEP_KINDS.join(" | ")}. Aucun autre verbe n'existe.`,
		"Champs propres à chaque verbe :",
		"- validate : { kind:'validate', schema:'<NomDuSchéma>' }",
		"- authorize : { kind:'authorize', policy:'<nomPolicy>' }",
		"- read : { kind:'read', entity:'<Entité>', where:'<paires clé = valeur, une par ligne>', as:'$.<slot>' }",
		`- mutate : { kind:'mutate', entity:'<Entité>', op:'<${MUTATE_OPS.join(" | ")}>', data:'<paires clé = valeur>', where:'<paires clé = valeur>', as:'$.<slot>' }`,
		"- branch : { kind:'branch', cond:'<expression>' }",
		"- return : { kind:'return', ref:'$.<slot>' }",
		`Entités du projet (pistes) : ${grammar.entities.join(", ") || "∅"}.`,
		`Policies du projet (pistes) : ${grammar.policies.join(", ") || "∅"}.`,
		`Événements du projet (pistes) : ${grammar.events.join(", ") || "∅"}.`,
		"Les where/data sont du TEXTE : une paire « clé = valeur » par ligne (jamais un objet imbriqué).",
		"Tu PROPOSES seulement : ton brouillon repassera par le réducteur déterministe buildOperation (le code a l'autorité). N'invente JAMAIS un verbe hors la liste.",
		'Réponds UNIQUEMENT par un objet JSON valide, sans aucun texte autour : {"reply":"<1-2 phrases en français, langage simple, ce que tu as compris>","candidate":{"name":"","input":"","steps":[…],"emits":[…]}}.',
		"Si la description est trop vague pour proposer une étape, renvoie candidate:null et explique dans reply ce qu'il te manque.",
		"",
		`Description : "${nl.replace(/"/g, "'")}"`,
	].join("\n");
}

/**
 * LlmCaller — la frontière INJECTABLE de l'appel LLM. En prod, c'est defaultLlmCaller (le
 * binaire Claude, le pattern prouvé). Dans le miroir, un faux client DÉTERMINISTE — afin de
 * prouver, sans réseau ni LLM, que le LLM N'EST JAMAIS AUTORITAIRE (le code juge le candidat).
 * Renvoie le texte de réponse du modèle (la prose qui contient le JSON), ou null en panne.
 */
export type LlmCaller = (prompt: string) => Promise<string | null>;

/** defaultLlmCaller — l'appel RÉEL au binaire Claude (le pattern de chatTurnAction / reformulateAction). */
const defaultLlmCaller: LlmCaller = async (prompt) => {
	try {
		const { stdout } = await execFileP(
			CLAUDE_BIN,
			[
				"-p",
				prompt,
				"--model",
				process.env.AIDOS_LLM_MODEL ?? "claude-opus-4-8",
				"--output-format",
				"json",
				"--max-turns",
				"1",
			],
			// 150s : opus-4-8 (le modèle déclaré) prend ~70-120s/tour ; un timeout court le
			// coupait sous charge. Panne réelle → null (repli déterministe : aucun prefill).
			{ cwd: "/tmp", timeout: 150_000, maxBuffer: 8 * 1024 * 1024 },
		);
		const outer = JSON.parse(stdout) as { result?: unknown };
		return typeof outer?.result === "string" ? outer.result : null;
	} catch {
		return null;
	}
};

/**
 * ProposeFromTextResult — le verdict rendu à l'écran. Forme close, quatre issues :
 *   - "llmUnavailable" : panne LLM / JSON illisible → aucun prefill (repli déterministe pur).
 *   - "malformed"      : le candidat n'a même pas la forme close (coerceCandidate → null) →
 *                        aucun prefill (le candidat est JETÉ).
 *   - "refused"        : le candidat a la forme mais SORT de la grammaire (buildOperation l'a
 *                        refusé) → on renvoie les refus TYPÉS + le `typed` proposé pour que B
 *                        l'affiche AVEC les erreurs (jamais un prefill « valide » trompeur).
 *   - "prefill"        : le candidat franchit la grammaire → `typed` pré-remplit l'éditeur B ;
 *                        l'utilisateur revoit/édite, ajoute le miroir (C), puis « Proposer ».
 * `reply` = la phrase du LLM (ce qu'il a compris), toujours du texte, jamais une autorité.
 */
export type ProposeFromTextResult =
	| { kind: "llmUnavailable"; reply: string }
	| { kind: "malformed"; reply: string }
	| { kind: "refused"; reply: string; typed: TypedInputs; errors: BuildError[] }
	| { kind: "prefill"; reply: string; typed: TypedInputs };

/**
 * proposeFromText — l'EXCEPTION GATÉE du chat A. Le LLM PROPOSE un candidat ; le code le JUGE.
 *
 * Le quatrième argument `call` est la frontière injectable (defaultLlmCaller en prod, un faux
 * client dans le miroir) : c'est ce qui rend la GARANTIE testable sans réseau — le LLM ne franchit
 * JAMAIS buildOperation. JAMAIS d'écriture-vérité (LE MUR §2) : ce geste ne fait que pré-remplir
 * l'éditeur typé (B) ; la proposition réelle (idea_capture) reste proposeOperationAction (inchangé).
 */
export async function proposeFromText(
	nl: string,
	grammar: OperationGrammar,
	call: LlmCaller = defaultLlmCaller,
): Promise<ProposeFromTextResult> {
	const clean = nl.trim().slice(0, 1200);
	if (clean === "") return { kind: "llmUnavailable", reply: "" };

	// 1. Le LLM PROPOSE (l'exception gatée). Toute panne → repli déterministe (aucun prefill).
	const raw = await call(candidatePrompt(clean, grammar));
	if (raw === null) return { kind: "llmUnavailable", reply: "" };

	// 2. PARSE le JSON (rejet si illisible). Le LLM est confiné au NL→JSON ; rien de plus.
	let inner: { reply?: unknown; candidate?: unknown };
	try {
		inner = JSON.parse(extractJson(raw)) as {
			reply?: unknown;
			candidate?: unknown;
		};
	} catch {
		return { kind: "llmUnavailable", reply: "" };
	}
	const reply =
		typeof inner?.reply === "string" ? inner.reply.trim().slice(0, 600) : "";

	// Le LLM peut explicitement renoncer (candidate:null) → aucun prefill, on garde sa phrase.
	if (inner.candidate === null || inner.candidate === undefined) {
		return { kind: "malformed", reply };
	}

	// 3. JUGE le candidat — coerceCandidate (forme close) puis buildOperation (l'AUTORITÉ). Le
	//    LLM N'A AUCUNE AUTORITÉ : tout ce qui sort de la grammaire est refusé de façon TYPÉE.
	const verdict = judgeCandidate(inner.candidate);
	if (verdict.kind === "malformed") {
		// Le candidat n'a même pas la forme close (pas un objet, steps non-array) → JETÉ.
		return { kind: "malformed", reply };
	}

	// 4. Le candidat a la forme ; buildOperation décide. Refus ⇒ refus TYPÉ à l'écran (+ le typed
	//    proposé pour que B l'affiche AVEC les erreurs). OK ⇒ le typed pré-remplit l'éditeur B.
	if (!verdict.build.ok) {
		return {
			kind: "refused",
			reply,
			typed: verdict.typed,
			errors: [...verdict.build.errors],
		};
	}
	return { kind: "prefill", reply, typed: verdict.typed };
}
