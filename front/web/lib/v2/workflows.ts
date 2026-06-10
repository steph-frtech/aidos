/**
 * WB2-13 — le TWIN PUR du PIPELINE FKE-3 : un SCÉNARIO/WORKFLOW de la verticale rendu en React Flow
 * avec des nœuds CUSTOM (étape / gate / décision), pan/zoom, édition PROPOSÉE (déplacer un nœud, jamais
 * écrit). Là où WB2-12 montre une fixture comme une suite LINÉAIRE de frames (état → commande → events),
 * WB2-13 la projette comme un PIPELINE de la verticale : les verbes deviennent des étapes, le `authorize`
 * devient un GATE, et le gate BRANCHE sur une DÉCISION (allow → suite → succès ; deny → arrêt). C'est le
 * « flux » d'un scénario, lisible et déplaçable (édition proposée), jamais une écriture de vérité.
 *
 * Ce module tient la LOGIQUE PURE (déterminisme-first, CLAUDE.md §6/§8) — React Flow n'est que du rendu :
 *   - `workflowGraph(fixture)` projette la fixture en un graphe TYPÉ : des nœuds custom (étape/gate/décision)
 *     et des arêtes étiquetées (la commande / la branche allow|deny), content-adressé déterministe ;
 *   - `moveNode(graph, id, pos)` est l'ÉDITION PROPOSÉE : elle renvoie un NOUVEAU graphe avec la position
 *     d'un nœud changée — PURE & IMMUABLE (le graphe d'origine intact). Déplacer ne PROPOSE qu'un layout,
 *     il n'écrit aucune vérité (le mur, §2) ; le graphe source reste content-adressé inchangé.
 *
 * RÉUTILISATION (pas de fork, ADR 0007) : la VÉRITÉ du déroulé (les verbes, le DENY court-circuit, l'ordre
 * des events) vient du twin WB2-12 (`frames`, `verdict`) qui lui-même réutilise l'interpréteur S10
 * (`lib/operation.ts`). Ce module ne fait que RE-PROJETER ces frames en un pipeline branché. Aucun aléa,
 * aucune horloge, aucun LLM : `workflowGraph(f)` deux fois → le MÊME graphe (mêmes ids, mêmes positions).
 *
 * LE MUR (CLAUDE.md §2) : afficher et déplacer un nœud n'écrit AUCUNE vérité — l'édition est PROPOSÉE
 * (un layout local), jamais appliquée au kernel. L'écran PROPOSE, il n'applique rien.
 */

import {
	CREATE_ORDER_DENIED,
	CREATE_ORDER_HAPPY,
	FIXTURES,
	frames,
	type OperationFixture,
	verdict,
} from "./operations";

/**
 * Le TYPE d'un nœud du pipeline (les trois nœuds custom de React Flow demandés par WB2-13) :
 *   - `step`     : une étape ordinaire du flux (validate / read / mutate / return) ;
 *   - `gate`     : un point de garde — le `authorize` qui peut REFUSER (la frontière §93 « tout DENY bloque ») ;
 *   - `decision` : la bifurcation calculée d'un gate (allow → la suite ; deny → l'arrêt) ;
 *   - `start` / `end` : les bornes du flux (l'entrée et la sortie — succès ou refus).
 */
export type WorkflowNodeKind = "start" | "step" | "gate" | "decision" | "end";

/** Le verdict d'un nœud `end` : le flux a-t-il abouti (succès) ou a-t-il été refusé (deny) ? */
export type EndOutcome = "success" | "denied";

/** Une POSITION 2D déterministe (pas d'aléa) — React Flow place le nœud à `{x, y}`. */
export interface NodePos {
	readonly x: number;
	readonly y: number;
}

/** Un NŒUD custom du pipeline (étape / gate / décision / borne), content-adressé par son id. */
export interface WorkflowNode {
	/** L'identité STABLE du nœud, content-adressée par sa position dans le flux ("w0", "w1", …). */
	readonly id: string;
	/** Le type custom (pour le rendu React Flow : étape / gate / décision / borne). */
	readonly kind: WorkflowNodeKind;
	/** Le libellé affiché (le verbe, la policy du gate, « allow ?/deny », « début »/« fin »). */
	readonly label: string;
	/** La position 2D déterministe (le layout par défaut, déplaçable en édition proposée). */
	readonly position: NodePos;
	/** Pour un `end` : le verdict du flux (success | denied) ; absent ailleurs. */
	readonly outcome?: EndOutcome;
}

/** Une ARÊTE du pipeline : un lien dirigé entre deux nœuds, étiqueté par la commande ou la branche. */
export interface WorkflowEdge {
	readonly id: string;
	readonly source: string;
	readonly target: string;
	/** L'étiquette (le verbe enchaîné, ou « allow »/« deny » pour les branches d'une décision). */
	readonly label: string;
	/** La branche d'une décision (allow|deny) — pour styler la sortie d'un gate ; absent ailleurs. */
	readonly branch?: "allow" | "deny";
}

/** Le GRAPHE de pipeline complet (nœuds custom + arêtes) — la projection que React Flow rend. */
export interface WorkflowGraph {
	/** L'id de la fixture-source (ex. "createOrder/happy") — la provenance du flux. */
	readonly fixtureId: string;
	readonly nodes: readonly WorkflowNode[];
	readonly edges: readonly WorkflowEdge[];
}

/** L'espacement vertical déterministe entre deux nœuds enchaînés (le layout par défaut). */
const STEP_Y = 90;
/** Le décalage horizontal de la branche `deny` d'une décision (la sortie d'arrêt, à droite). */
const DENY_X = 220;

/**
 * `workflowGraph` PROJETTE une fixture en son PIPELINE FKE-3 — PURE & TOTALE & DÉTERMINISTE.
 *
 * Le flux : `start` → (chaque verbe) → `end`. Le `authorize` est un `gate` SUIVI d'un nœud `decision`
 * qui BRANCHE :
 *   - branche `allow` → la suite des verbes → un `end{success}` ;
 *   - branche `deny`  → un `end{denied}` (le court-circuit §93 : « tout DENY bloque »).
 * Quand la fixture refuse (verdict deny), seule la branche `deny` est « vivante » ; quand elle passe, la
 * branche `allow` l'est — mais les DEUX branches sont TOUJOURS dessinées (le scénario montre le pipeline
 * complet, pas seulement le chemin pris). L'identité d'un nœud est content-adressée par sa position dans
 * le flux ("w<index>"), donc deux appels donnent le MÊME graphe (mêmes ids, mêmes positions, même ordre).
 * Aucun aléa, aucune horloge, aucun LLM.
 */
export function workflowGraph(fixture: OperationFixture): WorkflowGraph {
	// La VÉRITÉ du déroulé vient du twin WB2-12 : les frames (sans la frame −1 « idle »).
	const fs = frames(fixture).filter((f) => f.index >= 0);
	const denied = verdict(fixture).pass === false;

	const nodes: WorkflowNode[] = [];
	const edges: WorkflowEdge[] = [];
	let y = 0;
	let prevId = "w0";
	// le marqueur LOCAL « la prochaine arête est la branche allow d'une décision » (reset à chaque appel
	// — local, donc workflowGraph reste PURE : aucun état partagé entre deux appels).
	let pendingAllowFrom = "";

	// borne d'entrée.
	nodes.push({
		id: "w0",
		kind: "start",
		label: fixture.command.name,
		position: { x: 0, y },
	});
	y += STEP_Y;

	let counter = 1;
	for (const f of fs) {
		const id = `w${counter}`;
		const isGate = f.command.startsWith("authorize");
		if (isGate) {
			// 1 · le GATE (le authorize lui-même).
			nodes.push({ id, kind: "gate", label: f.command, position: { x: 0, y } });
			edges.push({
				id: `${prevId}->${id}`,
				source: prevId,
				target: id,
				label: f.command,
			});
			y += STEP_Y;
			counter++;
			prevId = id;

			// 2 · la DÉCISION (la bifurcation calculée du gate).
			const decId = `w${counter}`;
			nodes.push({
				id: decId,
				kind: "decision",
				label: "allow ? / deny",
				position: { x: 0, y },
			});
			edges.push({
				id: `${prevId}->${decId}`,
				source: prevId,
				target: decId,
				label: "",
			});
			y += STEP_Y;
			counter++;

			// 3 · la branche DENY → un end{denied}, dessinée à droite.
			const denyId = `w${counter}`;
			nodes.push({
				id: denyId,
				kind: "end",
				label: "deny → arrêt",
				position: { x: DENY_X, y },
				outcome: "denied",
			});
			edges.push({
				id: `${decId}->${denyId}`,
				source: decId,
				target: denyId,
				label: "deny",
				branch: "deny",
			});
			counter++;

			// la suite (la branche allow) repart de la décision.
			prevId = decId;
			// la première arête sortant de la décision (vers le prochain verbe) est étiquetée « allow ».
			// on marque que le prochain lien est la branche allow :
			pendingAllowFrom = decId;
		} else {
			const kind: WorkflowNodeKind = "step";
			nodes.push({ id, kind, label: f.command, position: { x: 0, y } });
			if (pendingAllowFrom) {
				edges.push({
					id: `${pendingAllowFrom}->${id}`,
					source: pendingAllowFrom,
					target: id,
					label: "allow",
					branch: "allow",
				});
				pendingAllowFrom = "";
			} else {
				edges.push({
					id: `${prevId}->${id}`,
					source: prevId,
					target: id,
					label: f.command,
				});
			}
			y += STEP_Y;
			counter++;
			prevId = id;
		}
	}

	// borne de sortie (succès) — au bout de la branche allow.
	const endId = `w${counter}`;
	const successLabel = denied ? "fin" : "succès";
	if (pendingAllowFrom) {
		// le gate était le DERNIER verbe (fixture deny) : la branche allow va directement à l'end success.
		nodes.push({
			id: endId,
			kind: "end",
			label: successLabel,
			position: { x: 0, y },
			outcome: "success",
		});
		edges.push({
			id: `${pendingAllowFrom}->${endId}`,
			source: pendingAllowFrom,
			target: endId,
			label: "allow",
			branch: "allow",
		});
	} else {
		nodes.push({
			id: endId,
			kind: "end",
			label: successLabel,
			position: { x: 0, y },
			outcome: "success",
		});
		edges.push({
			id: `${prevId}->${endId}`,
			source: prevId,
			target: endId,
			label: "",
		});
	}

	return { fixtureId: fixture.id, nodes, edges };
}

/**
 * `moveNode` est l'ÉDITION PROPOSÉE — PURE & IMMUABLE. Elle renvoie un NOUVEAU graphe avec la position
 * d'un nœud changée ; le graphe d'origine reste INTACT (content-adressé inchangé). Déplacer un nœud ne
 * PROPOSE qu'un layout local, il n'écrit AUCUNE vérité (le mur, §2). Un id inconnu → le graphe inchangé
 * (totalité : pas de plantage, pas d'écriture muette).
 */
export function moveNode(
	graph: WorkflowGraph,
	id: string,
	pos: NodePos,
): WorkflowGraph {
	return {
		fixtureId: graph.fixtureId,
		nodes: graph.nodes.map((n) => (n.id === id ? { ...n, position: pos } : n)),
		edges: graph.edges,
	};
}

/**
 * Le COMPTE des nœuds par type — un petit résumé déterministe du pipeline (pour l'écran : « N étapes,
 * 1 gate, 1 décision »). PURE & TOTALE.
 */
export function nodeKindCounts(
	graph: WorkflowGraph,
): Record<WorkflowNodeKind, number> {
	const counts: Record<WorkflowNodeKind, number> = {
		start: 0,
		step: 0,
		gate: 0,
		decision: 0,
		end: 0,
	};
	for (const n of graph.nodes) counts[n.kind]++;
	return counts;
}

// ── Les scénarios CANONIQUES (réutilisent les fixtures WB2-12) ────────────────

/** Le scénario « chemin heureux » (allow → OrderCreated, CartCleared → succès). */
export const WORKFLOW_HAPPY: OperationFixture = CREATE_ORDER_HAPPY;
/** Le scénario « refusé » (deny → court-circuit → arrêt). */
export const WORKFLOW_DENIED: OperationFixture = CREATE_ORDER_DENIED;

/** Le registre CLOS des scénarios (réutilise les fixtures WB2-12, mêmes ids/slugs). */
export const WORKFLOWS: Record<string, OperationFixture> = FIXTURES;

/** Le slug de route d'un scénario — "createOrder/happy" → "createOrder--happy" (mêmes règles que WB2-12). */
export function workflowSlug(id: string): string {
	return id.replaceAll("/", "--");
}

/** Résout un slug de route vers un scénario (totalité : undefined pour un slug inconnu → 404). */
export function workflowBySlug(slug: string): OperationFixture | undefined {
	return WORKFLOWS[slug.replaceAll("--", "/")];
}

/** Les slugs de tous les scénarios connus (pour la liste + generateStaticParams). */
export function workflowSlugs(): string[] {
	return Object.keys(WORKFLOWS).map(workflowSlug);
}

/** Le slug d'étape canonique de WB2-13 (pour la seed de doc de l'écran). */
export const STEP_SLUG = "wb2-13-workflows";
