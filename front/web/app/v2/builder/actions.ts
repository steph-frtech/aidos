"use server";

import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { deployStack } from "@/app/ai-lab/actions";
import { INTENT_KINDS } from "@/lib/v2/builder";

const execFileP = promisify(execFile);

/** Le binaire Claude Code derrière le geste « Reformuler » (même précédent que /ai-lab). */
const CLAUDE_BIN =
	process.env.AIDOS_CLAUDE_BIN || "/home/stevig/.local/bin/claude";

/** Extrait l'objet JSON d'une réponse de modèle qui peut porter de la prose / des fences. */
function extractJson(text: string): string {
	const a = text.indexOf("{");
	const b = text.lastIndexOf("}");
	return a >= 0 && b > a ? text.slice(a, b + 1) : "";
}

/** Le prompt de reformulation : un message ambigu → UNE phrase d'intention claire du jeu clos. */
function reformulatePrompt(message: string): string {
	return [
		"Tu assistes le IA Builder d'AIDOS (ADR 0057) : UN chat dont la grammaire d'intentions est FERMÉE.",
		`Le jeu CLOS des intentions : {${INTENT_KINDS.join(", ")}}.`,
		"Le message utilisateur ci-dessous est AMBIGU (plusieurs intentions s'accrochent à égalité).",
		"Réécris-le en UNE SEULE phrase française d'intention CLAIRE, qui ne porte qu'UNE intention du jeu clos.",
		"Garde le contenu utile du message (libellés, chemins a/b/c) verbatim ; commence par le verbe fort de l'intention retenue",
		"(« greffe … sous … », « capture l'idée : … », « promeus … », « quel impact si je modifie … », « montre … », « déploie … »).",
		"Tu PROPOSES seulement : la phrase réécrite repassera par le MÊME pipeline déterministe (le code a l'autorité).",
		'Réponds UNIQUEMENT par un objet JSON valide, sans aucun texte autour : {"text":"<la phrase>"}',
		"",
		`Message : "${message.replace(/"/g, "'")}"`,
	].join("\n");
}

/**
 * reformulateAction — l'EXCEPTION GATÉE (§6/§8) du builder : Claude reformule un message
 * ambigu en UNE phrase d'intention claire. AUTORITÉ DÉTERMINISTE : le texte réécrit est
 * RENVOYÉ au client, qui le repasse dans le MÊME pipeline understand/applyIntent — le LLM
 * ne décide jamais, il propose une phrase que le code re-juge. Toute panne → null (le
 * client affiche une note neutre et retombe sur les chips déterministes). LE MUR (§2) :
 * aucune écriture-vérité — une reformulation est du texte, rien d'autre.
 */
export async function reformulateAction(
	message: string,
): Promise<{ text: string } | null> {
	const clean = message.trim().slice(0, 600);
	if (clean === "") return null;
	try {
		const { stdout } = await execFileP(
			CLAUDE_BIN,
			[
				"-p",
				reformulatePrompt(clean),
				"--model",
				process.env.AIDOS_LLM_MODEL ?? "claude-opus-4-8",
				"--output-format",
				"json",
				"--max-turns",
				"1",
			],
			{ cwd: "/tmp", timeout: 150_000, maxBuffer: 8 * 1024 * 1024 },
		);
		const outer = JSON.parse(stdout);
		const text = typeof outer?.result === "string" ? outer.result : "";
		const inner = JSON.parse(extractJson(text));
		const rewritten =
			typeof inner?.text === "string" ? inner.text.trim().slice(0, 300) : "";
		if (rewritten === "") return null;
		return { text: rewritten };
	} catch {
		return null;
	}
}

/**
 * deployRealAction — le DÉPLOIEMENT RÉEL du builder (ADR 0052) : RÉUTILISE le pipeline
 * /ai-lab (deployStack : réémission best-effort + docker compose up -d sur la stack fixe),
 * jamais un second chemin de déploiement. L'exécution réelle est le GESTE HUMAIN (le clic),
 * offert SEULEMENT après l'échelle in-model gravie jusqu'en prod (le cliquet généralisé) —
 * l'écran gate le bouton sur envs.prod. LE MUR (§2) : une action au-dessous de la ligne
 * (émettre + lancer l'app émise), aucune écriture-vérité.
 */
export async function deployRealAction(): Promise<{
	ok: boolean;
	url: string | null;
	detail: string;
}> {
	const res = await deployStack();
	return res.status === "up"
		? { ok: true, url: res.url, detail: res.detail }
		: { ok: false, url: null, detail: res.detail };
}
