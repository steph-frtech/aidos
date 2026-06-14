"use server";

import { execFile } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { resolve, sep } from "node:path";
import { promisify } from "node:util";
import type { DesignBranchMove } from "@/lib/v3/design/design-branches";
import { isDesignBranchMove } from "@/lib/v3/design/design-branches";

const execFileP = promisify(execFile);

/**
 * /v3/design — LE CHAT IA GATÉ DU DESIGN LAB (ADR 0071 §4, Tranche 4). Le VRAI Claude
 * (même précédent que /v3 et /ai-lab : le binaire claude, --model AIDOS_LLM_MODEL,
 * --output-format json) répond chaleureusement ET PROPOSE une phrase canonique de la
 * GRAMMAIRE DESIGN FERMÉE.
 *
 * DÉTERMINISME-FIRST (§6/§8). C'est l'EXCEPTION LLM GATÉE : le modèle PROPOSE, il ne
 * décide RIEN. Chaque proposition retournée est RE-JUGÉE côté client par CE qui fait
 * autorité — rejudgeDesignProposal (lib/v3/design/screen-design : le catalogue FERMÉ +
 * composeScreenDesign + classifyGesture) — AVANT toute capture. Une proposition hors-
 * catalogue (hex, jeton étranger, propriété inconnue) est REFUSÉE fail-closed ; une
 * proposition structurelle est routée vers idée→/goal. IA éteinte, le client passe le
 * texte BRUT au MÊME re-jugement (le chemin déterministe suffit, le rejeu reste vert).
 *
 * LE MUR (§2). Une réponse est du TEXTE ; une proposition est une PHRASE re-jugée — jamais
 * une écriture-vérité, jamais une capture directe par le LLM. Toute panne → null (le client
 * retombe sur le re-jugement déterministe du texte brut). Une seule paire {reply, proposal}
 * (la proposition est ATOMIQUE : une coordonnée, un empilement — re-jugée d'un bloc).
 */

/** Le binaire Claude Code derrière le chat design (même précédent que /v3 et /ai-lab). */
const CLAUDE_BIN =
	process.env.AIDOS_CLAUDE_BIN || "/home/stevig/.local/bin/claude";

/**
 * LA GRAMMAIRE DESIGN FERMÉE — les DEUX phrases que Claude peut proposer (et que le
 * re-jugement déterministe re-parse toujours). Le LLM les remplit VERBATIM ; le code
 * dispose. C'est tout ce que le chat design sait faire (rien d'autre — fail-closed).
 */
const DESIGN_PALETTE: readonly string[] = [
	"adapte <coordonnée> : <propriété>=<jeton> [<propriété>=<jeton> …]",
	"capture l'idée : <besoin structurel>",
];

/** Extrait l'objet JSON d'une réponse de modèle qui peut porter de la prose / des fences. */
function extractJson(text: string): string {
	const a = text.indexOf("{");
	const b = text.lastIndexOf("}");
	return a >= 0 && b > a ? text.slice(a, b + 1) : "";
}

/**
 * Le prompt-design : Claude discute ET traduit le langage naturel libre en UNE phrase
 * canonique. Le catalogue FERMÉ ADR 0010 est rappelé (jamais un hex) ; la frontière
 * styling/structurel est expliquée (un ajout/retrait/réordre de champ = capture d'idée).
 */
function designPrompt(
	message: string,
	coordsSummary: string,
	catalogueSummary: string,
): string {
	return [
		"Tu es l'assistant DESIGN d'AIDOS. Tu discutes naturellement en français avec un utilisateur NON technique qui veut changer l'apparence d'un écran de SON application.",
		`Les éléments de l'écran que tu peux adapter (coordonnées existantes) : ${coordsSummary}`,
		`Le catalogue FERMÉ de styles autorisés (ADR 0010, zinc + blue-600 — JAMAIS un hex, JAMAIS une classe libre) : ${catalogueSummary}`,
		"Tu PROPOSES UNE phrase canonique (le code la re-juge ensuite — tu ne décides rien) :",
		...DESIGN_PALETTE.map((g) => `- ${g}`),
		"Règle du MUR : un changement de STYLE (couleur, taille, espacement, radius, alignement, densité) → « adapte … ». Un changement de STRUCTURE (ajouter/retirer/réordonner un champ ou une section) → « capture l'idée : … » (ça passera par une validation).",
		'Réponds UNIQUEMENT en JSON : {"reply":"<1-2 phrases chaleureuses, langage simple, AUCUN jargon>","proposal":"<UNE phrase canonique>"} ; proposal peut être "" pour une simple réponse sans action.',
		"",
		`Message : "${message.replace(/"/g, "'")}"`,
	].join("\n");
}

/**
 * designChatTurnAction — l'exception gatée du chat design (§6/§8). Le VRAI Claude répond
 * + PROPOSE une phrase canonique. AUTORITÉ DÉTERMINISTE : la proposition repasse côté
 * client par rejudgeDesignProposal (le code juge ; le LLM propose). Toute panne → null
 * (le client retombe sur le re-jugement déterministe du texte brut). LE MUR (§2) : aucune
 * écriture-vérité — une réponse est du texte, la proposition est re-jugée puis send()ée.
 */
export async function designChatTurnAction(
	message: string,
	coordsSummary: string,
	catalogueSummary: string,
): Promise<{ reply: string; proposal: string } | null> {
	const clean = message.trim().slice(0, 600);
	if (clean === "") return null;
	try {
		const { stdout } = await execFileP(
			CLAUDE_BIN,
			[
				"-p",
				designPrompt(
					clean,
					coordsSummary.trim().slice(0, 2000),
					catalogueSummary.trim().slice(0, 1500),
				),
				"--model",
				process.env.AIDOS_LLM_MODEL ?? "claude-opus-4-8",
				"--output-format",
				"json",
				"--max-turns",
				"1",
			],
			// 150s : opus-4-8 (ADR 0070) prend ~70-120s/tour ; headroom sous charge (le LLM PROPOSE, le
			// déterministe dispose — panne → null, repli sur le re-jugement déterministe pur).
			{ cwd: "/tmp", timeout: 150_000, maxBuffer: 8 * 1024 * 1024 },
		);
		const outer = JSON.parse(stdout);
		const text = typeof outer?.result === "string" ? outer.result : "";
		const inner = JSON.parse(extractJson(text));
		const reply =
			typeof inner?.reply === "string" ? inner.reply.trim().slice(0, 600) : "";
		if (reply === "") return null;
		const proposal =
			typeof inner?.proposal === "string"
				? inner.proposal.trim().slice(0, 300)
				: "";
		return { reply, proposal };
	} catch {
		return null;
	}
}

// ─── TRANCHE 5 : LA PERSISTANCE DES BRANCHES DE DESIGN (le DAG S24, le mur §2) ────────────────
//
// Les branches/checkpoints de design SONT le VERSION DAG S24 (ADR 0071 §5). Le mouvement (branch /
// fork / restore) est DÉCIDÉ déterministe par le twin (lib/v3/design/design-branches → lib/v2/
// version-dag, le twin pur de S24) — l'AUTORITÉ. Cette server action PERSISTE le DAG résultant comme
// une PROJECTION below-the-line (un design-dag.json par projet), exactement le canal de projection
// d'emitWorkspaceAction — jamais une écriture-vérité.
//
// LE MUR (§2) + RÉUTILISE NE RÉINVENTE PAS (§6). La porte canonique de persistance est le MCP `dag`
// (back/mcp/dag, ADR 0009 : dag_branch / dag_checkout_ancestor / dag_rebranch déjà exposés, rôle
// `aidos` ; l'agent est SELECT-only). Tant que le store ne sert pas le DAG live (OpenQuestion S17/S31
// documentée dans lib/v2/version-dag — forward-dependency, NE BLOQUE PAS), on persiste la projection
// déterministe dans le workspace du projet ; le back-fill vers le MCP `dag` se fera au step Postgres.
// DÉTERMINISME-FIRST (§8) : AUCUN LLM ici — la donnée est le DAG calculé par le twin, écrite telle quelle.

/** Le dossier des projets persistés (le MÊME que projects-actions, gitignoré à la racine). */
const PROJECTS_DIR = "/data/dev/aidos/.aidos-projects";

/** L'id sûr pour un chemin de fichier — fail-closed : tout le reste est refusé (aucune écriture). */
const SAFE_PROJECT_ID = /^[a-z0-9-]{1,64}$/;

/** Le verdict d'une persistance de branche de design (ok + nombre de nœuds/arêtes écrits). */
export interface DesignBranchPersistResult {
	readonly ok: boolean;
	readonly nodes: number;
	readonly edges: number;
}

/** La forme minimale d'un DAG de design persistable (le twin VersionDag, sérialisé tel quel). */
interface PersistableDag {
	readonly nodes: ReadonlyArray<{
		readonly id: string;
		readonly label: string;
		readonly parentIds: readonly string[];
		readonly head: boolean;
		readonly stratum: string;
	}>;
	readonly edges: ReadonlyArray<{
		readonly from: string;
		readonly to: string;
		readonly changeset: string;
	}>;
}

/** Le DAG est-il une projection bien formée ? (fail-closed : le bruit n'est jamais écrit). */
function isPersistableDag(d: unknown): d is PersistableDag {
	if (d === null || typeof d !== "object") return false;
	const o = d as { nodes?: unknown; edges?: unknown };
	return Array.isArray(o.nodes) && Array.isArray(o.edges);
}

/**
 * designBranchPersistAction — PERSISTE le DAG de design d'un projet après un mouvement (branch /
 * fork / restore) DÉCIDÉ par le twin déterministe (l'autorité, §8). DÉTERMINISTE & fail-closed :
 * l'id de projet et le mouvement sont validés contre des jeux clos ; un id/mouvement hors-jeu →
 * refus (aucune écriture). La projection est écrite dans le workspace du projet (below-the-line, le
 * mur §2) — jamais le kernel/mirrors. La porte canonique (MCP `dag`, rôle `aidos`) reste le back-fill
 * au step Postgres (OpenQuestion documentée). Une panne d'écriture → {ok:false} (jamais un throw).
 */
export async function designBranchPersistAction(
	projectId: string,
	move: string,
	dag: unknown,
): Promise<DesignBranchPersistResult> {
	if (!SAFE_PROJECT_ID.test(projectId))
		return { ok: false, nodes: 0, edges: 0 };
	if (!isDesignBranchMove(move)) return { ok: false, nodes: 0, edges: 0 };
	if (!isPersistableDag(dag)) return { ok: false, nodes: 0, edges: 0 };
	try {
		const root = resolve(PROJECTS_DIR, projectId, "workspace", "design");
		mkdirSync(root, { recursive: true });
		const target = resolve(root, "design-dag.json");
		// jamais hors du workspace du projet (le même garde-fou qu'emitWorkspaceAction).
		if (!target.startsWith(root + sep))
			return { ok: false, nodes: 0, edges: 0 };
		const recorded: DesignBranchMove = move;
		writeFileSync(
			target,
			`${JSON.stringify({ move: recorded, dag }, null, "\t")}\n`,
			"utf8",
		);
		return { ok: true, nodes: dag.nodes.length, edges: dag.edges.length };
	} catch {
		return { ok: false, nodes: 0, edges: 0 };
	}
}
