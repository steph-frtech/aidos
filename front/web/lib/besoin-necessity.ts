/**
 * lib/besoin-necessity.ts — the TYPESCRIPT TWIN of the EL01 necessity spike (spike/besoin/model.go
 * + measure.go). Pure, deterministic functions: same need → same backlog → same numbers, so the
 * on-screen verdict the /besoin-necessity panel runs matches the Go probe exactly. No LLM, no
 * clock, no rng (determinism-first, CLAUDE.md §6/§8): the projection of a need to a backlog is a
 * pure function, never inferred.
 *
 * The question: does a flat free-text box (S64 "capturez votre idée") suffice to capture an app
 * need, or does a top-down rung-by-rung BesoinGraph with a forcing gate produce a backlog of Ideas
 * STRICTLY richer / ordered than a flat prompt? The output is FALSIFIABLE: if the BesoinGraph
 * backlog were NOT strictly richer, the verdict would be NO-GO and the EL track would stop.
 *
 * Spike-scoped: nothing here is truth. The /besoin-necessity panel reads this twin to make the
 * spike's go/no-go necessity VISIBLE and EXECUTABLE from a screen (the wall is intact — no
 * kernel/mirror/fitness write). EL02+ builds the real back/runtime/besoin package.
 */

export type Rung =
	| "product"
	| "journey"
	| "view"
	| "control"
	| "action"
	| "operation"
	| "entity";

// The TOTAL, CLOSED top-down order of the SOURCE rungs (KRD §23). Declared, not learned. Mirrors
// rungOrder in model.go exactly.
export const RUNG_ORDER: Rung[] = [
	"product",
	"journey",
	"view",
	"control",
	"action",
	"operation",
	"entity",
];

// journey/view are NoEmit (seed anchors, never an Idea) — the honest join with ideas.ProposesKinds()
// (control|policy|operation|action|entity|product), which does NOT contain journey/view.
const NO_EMIT = new Set<Rung>(["journey", "view"]);

function emits(r: Rung): boolean {
	return !NO_EMIT.has(r);
}

export interface Node {
	rung: Rung;
	body: string;
	refTo: Rung | ""; // the deeper rung this node constrains; "" for entity (leaf)
	truthKind: string;
	verifiability: string;
	scope: string;
	authority: string;
}

function fullyTyped(n: Node): boolean {
	return (
		n.truthKind !== "" &&
		n.verifiability !== "" &&
		n.scope !== "" &&
		n.authority !== ""
	);
}

export interface BesoinGraph {
	project: string;
	nodes: Node[];
}

export interface FlatPrompt {
	project: string;
	text: string;
}

export interface BacklogItem {
	proposes: string;
	rung: Rung;
	topoRank: number;
	refResolves: boolean;
	fullyTyped: boolean;
	anchorsAbove: string[];
}

export interface Backlog {
	source: "besoin-graph" | "flat-prompt";
	items: BacklogItem[];
	ordered: boolean;
	noEmitSeeded: number;
}

/** emitFromGraph projects the BesoinGraph to an ordered backlog of Ideas. Pure (mirrors EmitFromGraph). */
export function emitFromGraph(g: BesoinGraph): Backlog {
	const declared = new Set<Rung>(g.nodes.map((n) => n.rung));
	const bl: Backlog = {
		source: "besoin-graph",
		items: [],
		ordered: true,
		noEmitSeeded: 0,
	};
	let rank = 0;
	for (const rung of RUNG_ORDER) {
		const node = g.nodes.find((n) => n.rung === rung);
		if (!node) continue;
		if (!emits(rung)) {
			bl.noEmitSeeded++; // journey/view seed anchors, never an Idea
			continue;
		}
		const anchorsAbove: string[] = [];
		for (const above of RUNG_ORDER) {
			if (above === rung) break;
			if (declared.has(above)) anchorsAbove.push(above);
		}
		bl.items.push({
			proposes: rung, // verbatim — all mapping rungs are in ideas.ProposesKinds()
			rung,
			topoRank: rank,
			refResolves: node.refTo === "" || declared.has(node.refTo),
			fullyTyped: fullyTyped(node),
			anchorsAbove,
		});
		rank++;
	}
	return bl;
}

/** emitFromFlat projects the flat prompt to a backlog — one undifferentiated candidate. Pure. */
export function emitFromFlat(_p: FlatPrompt): Backlog {
	return {
		source: "flat-prompt",
		ordered: false,
		noEmitSeeded: 0,
		items: [
			{
				proposes: "product",
				rung: "product",
				topoRank: 0,
				refResolves: false,
				fullyTyped: false,
				anchorsAbove: [],
			},
		],
	};
}

export interface Richness {
	source: string;
	numIdeas: number;
	numResolved: number;
	numFullyTyped: number;
	numAnchored: number;
	ordered: boolean;
	noEmitSeeded: number;
}

/** measure counts the richness of a backlog. Pure (mirrors Measure). */
export function measure(bl: Backlog): Richness {
	const r: Richness = {
		source: bl.source,
		numIdeas: 0,
		numResolved: 0,
		numFullyTyped: 0,
		numAnchored: 0,
		ordered: bl.ordered,
		noEmitSeeded: bl.noEmitSeeded,
	};
	for (const it of bl.items) {
		r.numIdeas++;
		if (it.refResolves) r.numResolved++;
		if (it.fullyTyped) r.numFullyTyped++;
		if (it.anchorsAbove.length > 0) r.numAnchored++;
	}
	return r;
}

export interface Comparison {
	need: string;
	graph: Richness;
	flat: Richness;
	deltaIdeas: number;
	deltaResolved: number;
	deltaFullyTyped: number;
	deltaAnchored: number;
	graphOrdered: boolean;
	flatOrdered: boolean;
}

/** compare measures one need both ways and computes the deltas. Pure (mirrors Compare). */
export function compare(
	need: string,
	g: BesoinGraph,
	p: FlatPrompt,
): Comparison {
	const graph = measure(emitFromGraph(g));
	const flat = measure(emitFromFlat(p));
	return {
		need,
		graph,
		flat,
		deltaIdeas: graph.numIdeas - flat.numIdeas,
		deltaResolved: graph.numResolved - flat.numResolved,
		deltaFullyTyped: graph.numFullyTyped - flat.numFullyTyped,
		deltaAnchored: graph.numAnchored - flat.numAnchored,
		graphOrdered: graph.ordered,
		flatOrdered: flat.ordered,
	};
}

// DECLARED floor (above the line, not learned — CLAUDE.md §8). Mirrors MinIdeaGain.
export const MIN_IDEA_GAIN = 3;

export interface DraftIdea {
	proposes: string;
	intent: string;
	provenanceKind: string;
	provenanceFrom: string;
	status: string;
	hasMirror: false;
	hasVersion: false;
	openQuestions: string[];
}

export interface Verdict {
	go: boolean;
	cmp: Comparison;
	minIdeaGain: number;
	reproducible: boolean;
	rationale: string;
	harvest: DraftIdea;
}

// The worked example — the S46 demo checkout, captured both ways (mirrors fixture.go verbatim).
export const CHECKOUT_GRAPH: BesoinGraph = {
	project: "demo-checkout",
	nodes: [
		{
			rung: "product",
			body: "a customer places an order from their cart",
			refTo: "",
			truthKind: "behavioral",
			verifiability: "sampleable",
			scope: "region:*",
			authority: "product-owner",
		},
		{
			rung: "journey",
			body: "Given a cart with items / When the customer checks out / Then an order is placed",
			refTo: "",
			truthKind: "",
			verifiability: "",
			scope: "",
			authority: "",
		},
		{
			rung: "view",
			body: "Cart screen: goal=review+checkout, zones=[items,total,checkout-button], data=[cart.items]",
			refTo: "",
			truthKind: "",
			verifiability: "",
			scope: "",
			authority: "",
		},
		{
			rung: "control",
			body: "CheckoutButton: visible_when cart.items>0, enabled_when cart.items>0, triggers CheckoutSubmit",
			refTo: "action",
			truthKind: "behavioral",
			verifiability: "sampleable",
			scope: "region:*",
			authority: "product-owner",
		},
		{
			rung: "action",
			body: "CheckoutSubmit: invoke CreateOrder",
			refTo: "operation",
			truthKind: "behavioral",
			verifiability: "sampleable",
			scope: "region:*",
			authority: "product-owner",
		},
		{
			rung: "operation",
			body: "CreateOrder: read $.cart.items, mutate create Order with those line items",
			refTo: "entity",
			truthKind: "behavioral",
			verifiability: "sampleable",
			scope: "region:*",
			authority: "product-owner",
		},
		{
			rung: "entity",
			body: "Order: { id, items[]{product,quantity}, total }",
			refTo: "",
			truthKind: "structural",
			verifiability: "sampleable",
			scope: "region:*",
			authority: "data-owner",
		},
	],
};

export const CHECKOUT_FLAT: FlatPrompt = {
	project: "demo-checkout",
	text: "I want an app where a customer can place an order from their cart.",
};

/** harvest lifts the ONE durable lesson into a DRAFT candidate-Idea (no mirror, no version). Pure. */
export function harvest(): DraftIdea {
	return {
		proposes: "product",
		intent:
			"le besoin doit suivre l'architecture, niveau par niveau : avant l'app-builder, forcer l'utilisateur à expliquer son app rung par rung (product→journey→view→control→action→operation→entity) au-dessus du mur, plutôt qu'une boîte texte-libre plate — la sortie est un BesoinGraph ordonné, typé et content-adressé, strictement plus riche qu'un prompt plat.",
		provenanceKind: "human",
		provenanceFrom: "spike:EL01 (spike/besoin)",
		status: "draft",
		hasMirror: false,
		hasVersion: false,
		openQuestions: [
			"OQ-EL01-1 portée v1 : seuls les 7 rungs §23 + bandes invariant/policy sont visés ; saga/temporal/globalinvariant restent hors-grammaire-v1 (à trancher en EL02).",
			"OQ-EL01-2 métrique de richesse : le spike COMPTE (Ideas/refs/typage/ancres) ; la vraie gate (EL07 CanDescend + EL08 ShrinkOptionSpace) mesurera le rétrécissement d'un OptionSpace énumérable — le spike prouve le MÉCANISME, pas la métrique finale.",
			"OQ-EL01-3 le mur : la capture ici ne persiste RIEN ; EL14/EL15 captureront l'Idea via idea-intake idea_capture (provenance human, utterance verbatim).",
			"OQ-EL01-4 Linear : le MCP linear-server n'est pas authentifié dans cet environnement — l'issue EL01 n'a pu être déplacée par MCP ; à régulariser au prochain restart authentifié.",
		],
	};
}

/**
 * decide computes the spike's go/no-go necessity verdict (the twin of measure.go's Decide). GO iff
 * the BesoinGraph capture strictly dominates the flat prompt on every richness axis (with the
 * headline Idea gain ≥ the declared floor), the graph is ordered and the flat prompt is not, and
 * the measurement is reproducible. Otherwise NO-GO (roadmap spike-gate: the EL track stops).
 */
export function decide(): Verdict {
	const cmp = compare(
		"demo-checkout: a customer places an order from their cart",
		CHECKOUT_GRAPH,
		CHECKOUT_FLAT,
	);
	const again = compare(
		"demo-checkout: a customer places an order from their cart",
		CHECKOUT_GRAPH,
		CHECKOUT_FLAT,
	);
	const reproducible =
		again.deltaIdeas === cmp.deltaIdeas &&
		again.graph.numIdeas === cmp.graph.numIdeas;

	const strictlyRicher =
		cmp.deltaIdeas >= MIN_IDEA_GAIN &&
		cmp.deltaResolved > 0 &&
		cmp.deltaFullyTyped > 0 &&
		cmp.deltaAnchored > 0;
	const orderedDominance = cmp.graphOrdered && !cmp.flatOrdered;
	const go = strictlyRicher && orderedDominance && reproducible;

	let rationale: string;
	if (go) {
		rationale = `GO : sur la demo checkout, capturer le besoin en BesoinGraph top-down avec porte de forçage produit un backlog STRICTEMENT plus riche/ordonné que la boîte texte-libre — ${cmp.graph.numIdeas} Ideas ordonnées, dépendances-résolues, typées (+${cmp.deltaIdeas} sur le blob unique non-typé du prompt plat), ${cmp.graph.numResolved} à refs résolues (+${cmp.deltaResolved}), ${cmp.graph.numFullyTyped} portant les 4 métadonnées (+${cmp.deltaFullyTyped}), ${cmp.graph.numAnchored} portant le grounding anchors_above (+${cmp.deltaAnchored}), et ${cmp.graph.noEmitSeeded} rungs NoEmit (journey/view) seedant les ancres sans cast silencieux — versus une candidate indifférenciée que l'agent doit deviner. La boîte plate force prompt→code (le mur l'interdit) ; le BesoinGraph force l'utilisateur à expliquer son app niveau par niveau, au-dessus du mur. Reproductible (fonction pure, sans LLM). Le track est NÉCESSAIRE → on poursuit vers EL02. On HARVEST l'Idea-ancre.`;
	} else if (!reproducible) {
		rationale =
			"NO-GO : la comparaison n'est pas reproductible — écart de déterminisme. Le track EL s'arrête (spike-gate).";
	} else if (!orderedDominance) {
		rationale =
			"NO-GO : le backlog BesoinGraph n'est pas plus ordonné que le prompt plat — la revendication d'ordre architectural échoue. Le track EL s'arrête.";
	} else {
		rationale = `NO-GO : le backlog BesoinGraph ne domine pas strictement le prompt plat (Ideas +${cmp.deltaIdeas}, résolues +${cmp.deltaResolved}, typées +${cmp.deltaFullyTyped}, ancrées +${cmp.deltaAnchored}). Le track EL s'arrête (spike-gate).`;
	}

	return {
		go,
		cmp,
		minIdeaGain: MIN_IDEA_GAIN,
		reproducible,
		rationale,
		harvest: harvest(),
	};
}
