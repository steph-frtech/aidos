/**
 * lib/besoin-requirements-doc.ts — the EL19 deterministic requirements-doc projector
 * EmitRequirementsDoc(graph) → RequirementsDoc. This is the "architecture-following requirements doc"
 * the app-builder (S64–S77) consumes: the 7 ordered SOURCE rungs + the transversal bands + the
 * per-node metadata + carried OpenQuestions + the topo-sorted list of emitted Ideas (each with its
 * Proposes from LevelToProposes, its mirror form annexed, its anchors_above), addressed by the
 * graph_hash.
 *
 * DETERMINISM-FIRST (CLAUDE.md §6/§8): the projection is a PURE function of the BesoinGraph — same
 * graph (same nodes, same statuses, same metadata) → BYTE-IDENTICAL doc (same graph_hash, same
 * markdown). NO LLM enters the rendering. It COMPOSES the existing authoritative twins: the EL05
 * LevelToProposes table (the Proposes per rung), the EL16 emitIdeas emitter, the EL17 redBacklog
 * topo-sort, the EL10 levelMirrorForm. It re-implements NONE of them.
 *
 * THE WALL (CLAUDE.md §2): the doc PROPOSES candidate-truth Ideas — it carries NO version, NO mirror
 * (the emitted Ideas are HasMirror=false). EmitRequirementsDoc writes no kernel and no mirror;
 * promotion is the app-builder writing the mirror via /goal. The doc's "Ideas" section is the red
 * backlog hand-off to S64; the NoEmit rungs (journey/view) seed the anchors but are excluded from the
 * Idea count (they never emit).
 */

import { levelMirrorForm, type MirrorForm } from "./besoin-completeness";
import { allLevels, type Level } from "./besoin-grammar";
import { emitCount } from "./emit-ideas";
import { type BacklogItem, type Edge, redBacklog } from "./red-backlog";

// DocNodeStatus mirrors besoin.NodeStatus.
export type DocNodeStatus = "empty" | "drafting" | "resolved";

// DocNode is a rung of the BesoinGraph as the doc reads it: its level, lifecycle status, the verbatim
// human utterance, its declared body, the four-metadata completeness verdict, and carried
// OpenQuestions + outgoing refs (for the topo backlog).
export interface DocNode {
	level: Level;
	status: DocNodeStatus;
	utterance: string;
	body?: Record<string, unknown>;
	metaComplete: boolean;
	refs?: { field: string; to: Level }[];
	openQuestions?: string[];
}

// DocRung is one rendered rung row of the requirements doc (the 7 sources + the 2 bands, in order).
export interface DocRung {
	level: Level;
	status: DocNodeStatus;
	utterance: string;
	mirrorForm: MirrorForm | null;
	metaComplete: boolean;
	emits: boolean; // true iff the rung MAPS (EL05) — the count excludes NoEmit rungs.
	openQuestions: string[];
}

// RequirementsDoc is the projected artifact: the ordered rungs, the carried OpenQuestions, the
// topo-sorted backlog of Ideas (each item carrying Proposes + mirror form + anchors_above), the Idea
// count (NoEmit-excluded), and the content-address graph_hash. Pure projection of the graph.
export interface RequirementsDoc {
	graphHash: string;
	rungs: DocRung[];
	openQuestions: string[];
	backlog: BacklogItem[];
	ideaCount: number;
	markdown: string;
}

/**
 * emitRequirementsDoc projects a BesoinGraph (its nodes + edges + content-address) into the
 * architecture-following requirements doc. PURE: same input → byte-identical RequirementsDoc. It
 * COMPOSES redBacklog (EL17), levelMirrorForm (EL10), emitCount (EL16); re-implements none.
 */
export function emitRequirementsDoc(
	nodes: DocNode[],
	edges: Edge[],
	graphHash: string,
): RequirementsDoc {
	const byLevel = new Map<Level, DocNode>();
	for (const n of nodes) byLevel.set(n.level, n);

	// The 7 source rungs + the 2 transversal bands, in the canonical descent order (allLevels()).
	const rungs: DocRung[] = [];
	const carried: string[] = [];
	for (const level of allLevels()) {
		const node = byLevel.get(level);
		if (!node) continue;
		const emits = mapsToIdea(level, node.status);
		rungs.push({
			level,
			status: node.status,
			utterance: node.utterance,
			mirrorForm: levelMirrorForm(level),
			metaComplete: node.metaComplete,
			emits,
			openQuestions: [...(node.openQuestions ?? [])].sort(),
		});
		for (const q of node.openQuestions ?? []) {
			if (!carried.includes(q)) carried.push(q);
		}
	}
	carried.sort();

	// The topo-sorted backlog (EL17) over the emitting rungs — the exact promotion order for S64.
	// A cycle throws CycleError; the caller surfaces it (the doc cannot be projected over a cycle).
	const backlog = redBacklog(
		nodes.map((n) => ({
			level: n.level,
			status: n.status,
			utterance: n.utterance,
			refs: n.refs ?? [],
			body: n.body,
			openQuestions: n.openQuestions,
		})),
		edges,
	);

	const ideaCount = emitCount(
		nodes.map((n) => ({
			level: n.level,
			status: n.status,
			utterance: n.utterance,
		})),
	);

	const markdown = renderMarkdown(
		graphHash,
		rungs,
		carried,
		backlog,
		ideaCount,
	);

	return {
		graphHash,
		rungs,
		openQuestions: carried,
		backlog,
		ideaCount,
		markdown,
	};
}

// mapsToIdea is true iff a RESOLVED rung MAPS to a ProposesKind (EL05) — i.e. it emits an Idea. NoEmit
// rungs (journey/view/invariant) and non-resolved rungs never emit. Pure.
function mapsToIdea(level: Level, status: DocNodeStatus): boolean {
	if (status !== "resolved") return false;
	const c = emitCount([{ level, status: "resolved", utterance: "x" }]);
	return c > 0;
}

// renderMarkdown renders the deterministic markdown of the doc — the rungs in descent order, the
// carried OpenQuestions, then the topo-sorted Ideas. PURE: a fixed template over sorted data → the
// same bytes for the same graph. No clock, no rng, no LLM.
function renderMarkdown(
	graphHash: string,
	rungs: DocRung[],
	carried: string[],
	backlog: BacklogItem[],
	ideaCount: number,
): string {
	const lines: string[] = [];
	lines.push(`# Document d'exigences — BesoinGraph ${graphHash}`);
	lines.push("");
	lines.push(
		"> Le document suit l'architecture (verticale KRD §23). Chaque rung mappant sort comme Idea (candidate-truth) via la porte légale idea-intake ; les rungs NoEmit (journey/view) seedent les ancres sans émettre. Aucune écriture kernel : HasMirror toujours false.",
	);
	lines.push("");
	lines.push("## Niveaux (ordre de descente)");
	lines.push("");
	for (const r of rungs) {
		const flag = r.emits ? "→ Idea" : "NoEmit (ancre)";
		lines.push(`### ${r.level} — ${r.status} — ${flag}`);
		lines.push(`- intention : « ${r.utterance} »`);
		lines.push(`- forme de miroir attendue : ${r.mirrorForm ?? "—"}`);
		lines.push(
			`- métadonnées (4) : ${r.metaComplete ? "présentes/certifiables" : "incomplètes"}`,
		);
		for (const q of r.openQuestions) {
			lines.push(`- OpenQuestion : ${q}`);
		}
		lines.push("");
	}
	lines.push("## OpenQuestions portées (non bloquantes, bootstrap §6)");
	lines.push("");
	if (carried.length === 0) {
		lines.push("- (aucune)");
	} else {
		for (const q of carried) lines.push(`- ${q}`);
	}
	lines.push("");
	lines.push(
		`## Backlog rouge ordonné (${ideaCount} Idea(s) — NoEmit exclus) — ordre topologique`,
	);
	lines.push("");
	let i = 0;
	for (const item of backlog) {
		i++;
		lines.push(
			`${i}. proposes=${item.proposes} | rung=${item.fromLevel} | miroir=${item.mirrorForm} | intention=« ${item.intent} »`,
		);
		if (item.anchorsAbove.length > 0) {
			lines.push(
				`   - ancres au-dessus : ${item.anchorsAbove.map((a) => a.level).join(", ")}`,
			);
		}
		for (const q of item.openQuestions) {
			lines.push(`   - OpenQuestion : ${q}`);
		}
	}
	if (backlog.length === 0)
		lines.push("(aucune Idea émise — aucun rung mappant résolu)");
	lines.push("");
	return lines.join("\n");
}
