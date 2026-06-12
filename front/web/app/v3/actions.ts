"use server";

import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileP = promisify(execFile);

/** Le binaire Claude Code derrière le chat V3 (même précédent que /ai-lab et /v2/builder). */
const CLAUDE_BIN =
	process.env.AIDOS_CLAUDE_BIN || "/home/stevig/.local/bin/claude";

/**
 * LA PALETTE : les phrases canoniques PROUVÉES par le miroir lib/v2/builder.test.ts —
 * le jeu clos des gestes que Claude peut proposer (et que le réducteur re-juge toujours).
 */
const PALETTE: readonly string[] = [
	"capture l'idée : <besoin>",
	"greffe <libellé> sous <chemin>",
	"promeus la dernière idée",
	"génère l'application",
	"déploie l'application en dev",
	"déploie l'application en staging",
	"déploie l'application en prod",
	"montre le delta depuis la prod",
	"quel impact si je modifie <chemin>",
	"montre-moi l'état du projet",
	"ouvre l'écran <nom>",
];

/** Extrait l'objet JSON d'une réponse de modèle qui peut porter de la prose / des fences. */
function extractJson(text: string): string {
	const a = text.indexOf("{");
	const b = text.lastIndexOf("}");
	return a >= 0 && b > a ? text.slice(a, b + 1) : "";
}

/** Le prompt-palette : Claude discute ET décompose le message en gestes canoniques. */
function palettePrompt(message: string, stateSummary: string): string {
	return [
		"Tu es l'assistant AIDOS V3. Tu discutes naturellement en français avec un utilisateur NON technique et tu agis via des GESTES CANONIQUES.",
		`État du projet : ${stateSummary}`,
		"Gestes disponibles (réponds-les VERBATIM dans actions, en remplaçant les <champs> par les valeurs ; tu peux en enchaîner plusieurs) :",
		...PALETTE.map((g) => `- ${g}`),
		'Tu peux aussi ouvrir n’importe quel écran ("ouvre l’écran <nom>").',
		'Réponds UNIQUEMENT en JSON : {"reply":"<2-3 phrases chaleureuses, langage simple, AUCUN jargon>","actions":["<phrase canonique>", …]} ; actions peut être vide pour une simple réponse.',
		"",
		`Message : "${message.replace(/"/g, "'")}"`,
	].join("\n");
}

/**
 * chatTurnAction — l'exception gatée du chat V3 (§6/§8) : le VRAI Claude répond
 * chaleureusement ET propose des gestes canoniques. AUTORITÉ DÉTERMINISTE : chaque
 * action retournée repasse côté client par le MÊME pipeline understand/applyIntent —
 * le LLM propose, le code juge (une action invalide devient un refus doux). Toute
 * panne → null (le client retombe en mode déterministe pur). LE MUR (§2) : aucune
 * écriture-vérité — une réponse est du texte, les gestes sont re-jugés.
 */
export async function chatTurnAction(
	message: string,
	stateSummary: string,
): Promise<{ reply: string; actions: string[] } | null> {
	const clean = message.trim().slice(0, 600);
	if (clean === "") return null;
	try {
		const { stdout } = await execFileP(
			CLAUDE_BIN,
			[
				"-p",
				palettePrompt(clean, stateSummary.trim().slice(0, 2000)),
				"--model",
				"claude-fable-5",
				"--output-format",
				"json",
				"--max-turns",
				"1",
			],
			{ cwd: "/tmp", timeout: 90_000, maxBuffer: 8 * 1024 * 1024 },
		);
		const outer = JSON.parse(stdout);
		const text = typeof outer?.result === "string" ? outer.result : "";
		const inner = JSON.parse(extractJson(text));
		const reply =
			typeof inner?.reply === "string" ? inner.reply.trim().slice(0, 600) : "";
		if (reply === "") return null;
		const actions = Array.isArray(inner?.actions)
			? inner.actions
					.filter(
						(a: unknown): a is string =>
							typeof a === "string" && a.trim() !== "",
					)
					.map((a: string) => a.trim().slice(0, 300))
					.slice(0, 5)
			: [];
		return { reply, actions };
	} catch {
		return null;
	}
}
