/**
 * WB2-27 — le TWIN PUR du IA BUILDER (ADR 0057) : UN écran, UN chat qui fait TOUT —
 * mais « tout » passe par une GRAMMAIRE D'INTENTIONS FERMÉE et un RÉDUCTEUR PUR.
 *
 * LE MODÈLE (déterminisme-first §6/§8, poussé au maximum) :
 *   - le jeu des intentions est CLOS et DÉCLARÉ (INTENT_KINDS) — le chat ne sait faire
 *     que ce qui est déclaré, jamais « un peu de tout » ;
 *   - chaque message est CLASSÉ par un algorithme lexical (classifyIntent — accents
 *     pliés, lexiques déclarés, scores), JAMAIS par un prompt :
 *       · « L'ATTENTE »                       = le candidat en tête (understand) ;
 *       · « LES TYPES DE RÉPONSE POSSIBLES »  = TOUS les candidats, classés ;
 *       · l'AMBIGUÏTÉ (deux candidats à égalité) est DÉTECTÉE et REMONTÉE — jamais
 *         tranchée en silence (l'écran offre le choix ; le LLM n'est que l'exception
 *         gatée de désambiguïsation, et le code garde l'autorité) ;
 *   - applyIntent est un RÉDUCTEUR PUR event-sourcé : même (état, message) → même
 *     (état', événements, impacts) ; le journal est APPEND-ONLY (§9) ;
 *       · « LA RÉPONSE »   = les événements produits (jeu clos, typés) ;
 *       · « LES IMPACTS »  = la vague calculée (sous-arbre composes, idées, kernels).
 *
 * RÉUTILISATION (pas de fork — le builder COMPOSE les twins existants) : l'arbre
 * vivant (composition : seed/greffe/placement/position), l'idée (composeIdea — le
 * niveau, la facette et l'échelle sont PRIS DU NŒUD D'ATTACHE : le système identifie
 * la coordonnée entière), la promotion (goal : promoteIdea → kernel proposé, ChangeSet
 * DRAFT). L'impact code (code-graph) est composé CÔTÉ ÉCRAN sur le graphe extrait.
 *
 * LE MUR (§2) : aucune intention, sur aucun état, ne produit une écriture-vérité —
 * une idée a toujours hasMirror=false, un kernel proposé toujours wroteKernel=false,
 * un déploiement est PROPOSÉ (gaté ADR 0052), jamais exécuté ici. Épinglé par une
 * propriété ∀ du miroir lib/v2/builder.test.ts.
 */

import {
	growComposes,
	nodeByPath,
	nodePath,
	placeIntent,
	seedComposes,
} from "./composition";
import { type MirrorSpec, type ProposedKernel, promoteIdea } from "./goal";
import { composeIdea, type Idea } from "./idea";
import type { KernelNode } from "./kernel-tree";

/** Le jeu CLOS des intentions — tout ce que le chat sait faire, déclaré, rien d'autre. */
export const INTENT_KINDS = [
	"capturer_idee",
	"greffer",
	"promouvoir",
	"impacter",
	"interroger",
	"deployer",
] as const;
export type IntentKind = (typeof INTENT_KINDS)[number];

/** Un candidat de classement : une intention possible + son score d'accroche. */
export interface IntentCandidate {
	readonly kind: IntentKind;
	readonly score: number;
}

/** Le verdict de compréhension d'un message — « l'attente » + les possibles. */
export interface Understanding {
	/** comprise (un candidat net) · ambigue (égalité en tête) · incomprise (aucune accroche). */
	readonly status: "comprise" | "ambigue" | "incomprise";
	/** TOUS les candidats, classés score ↓ (les « types de réponse possibles »). */
	readonly candidates: readonly IntentCandidate[];
	/** L'intention en tête quand le statut est comprise (sinon null). */
	readonly attente: IntentKind | null;
}

/** Un ÉVÉNEMENT produit par le réducteur — jeu clos, typé (« la réponse »). */
export interface BuilderEvent {
	readonly kind:
		| "idee_capturee"
		| "arbre_greffe"
		| "kernel_propose"
		| "impact_calcule"
		| "etat_lu"
		| "deploiement_propose"
		| "refus";
	readonly detail: string;
	/** La référence content-adressée touchée (chemin, id d'idée, version…). */
	readonly ref: string;
}

/** Un IMPACT calculé (« quoi est touché ») — la vague, jamais estimée. */
export interface BuilderImpact {
	readonly cible: string;
	readonly type: "composes" | "idee" | "kernel";
}

/** L'ÉTAT du builder — event-sourcé : l'arbre vivant, les idées, les kernels proposés, le journal. */
export interface BuilderState {
	readonly tree: readonly KernelNode[];
	readonly ideas: readonly Idea[];
	readonly kernels: readonly ProposedKernel[];
	readonly log: readonly BuilderEvent[];
}

/** Le résultat d'un tour de chat : l'état suivant + les événements + la vague. */
export interface ApplyResult {
	readonly state: BuilderState;
	readonly events: readonly BuilderEvent[];
	readonly impacts: readonly BuilderImpact[];
}

/** L'état initial : l'arbre seed (un SEUL produit racine), rien d'autre. */
export function initBuilderState(): BuilderState {
	return { tree: seedComposes(), ideas: [], kernels: [], log: [] };
}

/** Plie un texte en tokens canoniques (accents pliés, ≥3 chars). */
function tokensOf(text: string): Set<string> {
	return new Set(
		text
			.normalize("NFD")
			.replace(/[̀-ͯ]/g, "")
			.toLowerCase()
			.split(/[^a-z0-9/]+/)
			.filter((t) => t.length >= 3),
	);
}

/**
 * Les LEXIQUES déclarés de la grammaire — par intention : verbes FORTS (2 points) et
 * indices FAIBLES (1 point). DÉCLARÉS au-dessus de la ligne, jamais appris (§8).
 */
const LEXICONS: Record<
	IntentKind,
	{ strong: readonly string[]; weak: readonly string[] }
> = {
	capturer_idee: {
		strong: ["capture", "capturer", "note", "noter", "enregistre"],
		weak: ["idee", "besoin", "veux", "voudrais"],
	},
	greffer: {
		strong: ["greffe", "greffer", "ajoute", "ajouter", "cree", "creer"],
		weak: ["sous", "branche", "noeud", "arbre"],
	},
	promouvoir: {
		strong: ["promeus", "promouvoir", "promotion", "goal", "gele", "geler"],
		weak: ["miroir", "kernel", "verite", "derniere"],
	},
	impacter: {
		strong: ["impact", "impacte", "impacts", "touche", "casse"],
		weak: ["modifie", "modifier", "change", "vague", "rouge"],
	},
	interroger: {
		strong: ["montre", "montrer", "affiche", "liste", "etat"],
		weak: ["voir", "combien", "projet", "resume"],
	},
	deployer: {
		strong: ["deploie", "deployer", "deploiement", "livre", "livrer"],
		weak: ["production", "prod", "ligne", "mettre"],
	},
};

/**
 * CLASSE un message contre la grammaire — un algorithme, pas un prompt. PURE & TOTALE &
 * DÉTERMINISTE : tokens pliés, +2 par verbe fort, +1 par indice faible ; TOUS les kinds
 * sont retournés, classés score ↓ puis ordre déclaré (stable). Ce classement EST la
 * liste des « types de réponse possibles ».
 */
export function classifyIntent(text: string): IntentCandidate[] {
	const tokens = tokensOf(text);
	return INTENT_KINDS.map((kind) => {
		const lex = LEXICONS[kind];
		let score = 0;
		for (const s of lex.strong) if (tokens.has(s)) score += 2;
		for (const w of lex.weak) if (tokens.has(w)) score += 1;
		return { kind, score };
	}).sort((a, b) =>
		a.score !== b.score
			? b.score - a.score
			: INTENT_KINDS.indexOf(a.kind) - INTENT_KINDS.indexOf(b.kind),
	);
}

/**
 * COMPREND un message : « l'attente » = le candidat net en tête ; une ÉGALITÉ en tête
 * (deux intentions au même score > 0) est une AMBIGUÏTÉ détectée — remontée, jamais
 * tranchée en silence ; aucune accroche = incomprise. PURE & TOTALE.
 */
export function understand(state: BuilderState, text: string): Understanding {
	void state;
	const candidates = classifyIntent(text);
	const top = candidates[0];
	if (top.score === 0)
		return { status: "incomprise", candidates, attente: null };
	if (candidates[1].score === top.score)
		return { status: "ambigue", candidates, attente: null };
	return { status: "comprise", candidates, attente: top.kind };
}

/** Le premier CHEMIN explicite (a/b/c) cité dans le message, sinon null. */
function explicitPath(text: string): string | null {
	const m = text
		.normalize("NFD")
		.replace(/[̀-ͯ]/g, "")
		.toLowerCase()
		.match(/[a-z0-9][a-z0-9-]*(?:\/[a-z0-9][a-z0-9-]*)+/);
	return m === null ? null : m[0];
}

/** Les chemins du SOUS-ARBRE d'un nœud (la vague composes) — descendants, ordre stable. */
function subtreePaths(tree: readonly KernelNode[], rootId: string): string[] {
	const out: string[] = [];
	const walk = (id: string) => {
		for (const n of tree)
			if (n.parentId === id) {
				out.push(nodePath(tree, n.id).join("/"));
				walk(n.id);
			}
	};
	walk(rootId);
	return out.sort();
}

/** Retire le préfixe verbal d'une intention de capture (« capture l'idée : … »). */
function stripCaptureVerb(text: string): string {
	const stripped = text.replace(
		/^.*?(?:capture[rz]?|note[rz]?|enregistre[rz]?)\s*(?:l['']\s*idee|l['']\s*idée)?\s*:?\s*/i,
		"",
	);
	return stripped.trim() === "" ? text.trim() : stripped.trim();
}

/** Extrait (libellé, chemin parent) d'une greffe : « greffe X sous a/b », fail-closed. */
function parseGraft(
	text: string,
	tree: readonly KernelNode[],
): { label: string; parentPath: string } | null {
	const folded = text.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
	const m = folded.match(
		/(?:greffe[rz]?|ajoute[rz]?|cree[rz]?)\s+(?:l[ae]s?\s+|l['']|un[e]?\s+|d[ue]s?\s+)?(.+?)\s+sous\s+([a-z0-9/-]+)/,
	);
	if (m !== null) return { label: m[1].trim(), parentPath: m[2] };
	// pas de « sous X » : le système identifie le point d'attache (placeIntent).
	const verb = folded.match(/(?:greffe[rz]?|ajoute[rz]?|cree[rz]?)\s+(.+)$/);
	if (verb === null) return null;
	const p = placeIntent(tree, text);
	if (p.nodeId === "") return null;
	return { label: verb[1].trim(), parentPath: p.path };
}

/**
 * APPLIQUE un message à l'état — LE RÉDUCTEUR PUR event-sourcé du builder. PURE &
 * TOTALE & DÉTERMINISTE : même (état, message) → même (état', événements, impacts).
 * Une intention ambiguë ou incomprise produit un événement `refus` (l'écran offre
 * alors les candidats — jamais un choix silencieux). Le journal est APPEND-ONLY.
 */
export function applyIntent(state: BuilderState, text: string): ApplyResult {
	const u = understand(state, text);
	const finish = (
		next: Omit<BuilderState, "log">,
		events: BuilderEvent[],
		impacts: BuilderImpact[],
	): ApplyResult => ({
		state: { ...next, log: [...state.log, ...events] },
		events,
		impacts,
	});

	if (u.status !== "comprise") {
		return finish(
			state,
			[
				{
					kind: "refus",
					detail:
						u.status === "ambigue"
							? "intention ambiguë — deux lectures possibles, choisissez un type de réponse"
							: "intention incomprise — aucun type de réponse ne s'accroche",
					ref: "",
				},
			],
			[],
		);
	}

	switch (u.attente as IntentKind) {
		case "greffer": {
			const g = parseGraft(text, state.tree);
			const parent = g === null ? null : nodeByPath(state.tree, g.parentPath);
			if (g === null || parent === null)
				return finish(
					state,
					[
						{
							kind: "refus",
							detail:
								"greffe refusée : point d'attache introuvable (fail-closed)",
							ref: g?.parentPath ?? "",
						},
					],
					[],
				);
			const grown = growComposes(state.tree, parent.id, g.label);
			const childPath = `${g.parentPath}/${g.label
				.normalize("NFD")
				.replace(/[̀-ͯ]/g, "")
				.toLowerCase()
				.replace(/[^a-z0-9]+/g, "-")
				.replace(/^-+|-+$/g, "")}`;
			return finish(
				{ ...state, tree: grown },
				[
					{
						kind: "arbre_greffe",
						detail: `« ${g.label} » greffé sous ${g.parentPath}`,
						ref: childPath,
					},
				],
				[{ cible: childPath, type: "composes" }],
			);
		}

		case "capturer_idee": {
			const intentText = stripCaptureVerb(text);
			const p = placeIntent(state.tree, intentText);
			const node = state.tree.find((n) => n.id === p.nodeId);
			if (node === undefined)
				return finish(
					state,
					[{ kind: "refus", detail: "placement introuvable", ref: "" }],
					[],
				);
			// Le SYSTÈME identifie la coordonnée ENTIÈRE depuis le nœud d'attache.
			const r = composeIdea(
				{
					intent: intentText,
					level: node.level,
					facet: node.facet,
					scale: p.path,
					provenance: "humain",
				},
				state.tree,
			);
			if (!r.ok)
				return finish(
					state,
					[
						{
							kind: "refus",
							detail: `capture refusée : ${r.errors.join(", ")}`,
							ref: "",
						},
					],
					[],
				);
			return finish(
				{ ...state, ideas: [...state.ideas, r.idea] },
				[
					{
						kind: "idee_capturee",
						detail: `idée ${r.idea.id} placée à ${p.path} (${node.level} × ${node.facet})`,
						ref: r.idea.id,
					},
				],
				[
					{ cible: p.path, type: "composes" },
					{ cible: r.idea.id, type: "idee" },
				],
			);
		}

		case "promouvoir": {
			const idea = state.ideas[state.ideas.length - 1];
			if (idea === undefined)
				return finish(
					state,
					[
						{
							kind: "refus",
							detail:
								"rien à promouvoir : aucune idée capturée (la porte reste idée → miroir → /goal)",
							ref: "",
						},
					],
					[],
				);
			const stub: MirrorSpec = {
				form: idea.expectedMirrorForm ?? "fixture_n2",
				text: `auto : ${idea.intent}`,
			};
			const r = promoteIdea(idea, stub);
			if (!r.ok)
				return finish(
					state,
					[
						{
							kind: "refus",
							detail: `promotion refusée : ${r.errors.join(", ")}`,
							ref: idea.id,
						},
					],
					[],
				);
			return finish(
				{ ...state, kernels: [...state.kernels, r.proposed] },
				[
					{
						kind: "kernel_propose",
						detail: `version gelée ${r.proposed.version} (ChangeSet ${r.proposed.changeSet.id} DRAFT — PROPOSE, n'applique pas)`,
						ref: r.proposed.version,
					},
				],
				[
					{ cible: r.proposed.version, type: "kernel" },
					{ cible: idea.id, type: "idee" },
				],
			);
		}

		case "impacter": {
			const path = explicitPath(text) ?? placeIntent(state.tree, text).path;
			const node = nodeByPath(state.tree, path);
			if (node === null)
				return finish(
					state,
					[
						{
							kind: "refus",
							detail: `impact : cible « ${path} » introuvable (fail-closed)`,
							ref: path,
						},
					],
					[],
				);
			const wave = subtreePaths(state.tree, node.id);
			return finish(
				state,
				[
					{
						kind: "impact_calcule",
						detail: `modifier ${path} touche ${wave.length} nœud(s) du sous-arbre`,
						ref: path,
					},
				],
				wave.map((cible) => ({ cible, type: "composes" as const })),
			);
		}

		case "interroger":
			return finish(
				state,
				[
					{
						kind: "etat_lu",
						detail: `arbre : ${state.tree.length} nœuds · idées : ${state.ideas.length} · kernels proposés : ${state.kernels.length}`,
						ref: "",
					},
				],
				[],
			);

		case "deployer":
			return finish(
				state,
				[
					{
						kind: "deploiement_propose",
						detail:
							"déploiement PROPOSÉ (gaté ADR 0052) — l'exécution reste un geste humain approuvé, jamais le chat",
						ref: "",
					},
				],
				[],
			);
	}
}
