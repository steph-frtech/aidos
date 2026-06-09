/**
 * ai-lab — FK11 (ROADMAP-fke, FKE-38, CORRECTED): the deterministic core of the AI Lab, a
 * two-pane SPEC GENERATOR (not a navigation cockpit). Every gap, scope and voyant shown is a
 * CALCULATION, never an LLM judgment (CLAUDE.md §6/§8). It COMPOSES the existing truths — the
 * FK09 conscience report (lib/conscience), the FK08 facet skeleton (lib/facetwire) — and AUTHORS
 * none.
 *
 * THE CORRECTED MODEL (FKE-38). Two panes:
 *   - GAUCHE — a NATURAL-LANGUAGE chat. A message GENERATES the SPECS — the ABOVE-the-wall side
 *     of each mirror-pair — across the 6 mirror-pairs of the chosen facet (a COLUMN of the 6×6):
 *     `generateSpecs`. It PROPOSES (amber); it NEVER writes a truth — a direct truth-write is
 *     REFUSED at the wall (the only door is idea → mirror → /goal).
 *   - DROITE — the 6×6 GRID (`buildGrid`): the 6 mirror-pairs (rows) × the facets (columns). Each
 *     cell carries its generated spec (above the wall) and its MACHINE — the executable
 *     mirror/test (below the wall) — with the live conscience voyant 🟢/🔴/🟡. « Les machines que
 *     ça change » = exactly these below-wall mirrors.
 *
 * (The cockpit primitives below — proposeSlot / buildCockpit / scopeForPair / applyCardValidation
 * — remain valid sub-capabilities: scoping a node, validating a decision card 🔴→🟢, drawing the
 * wall per source. They are reused by the conscience/decision surfaces; the LAB screen itself is
 * the generator above.)
 *
 * VALIDATING A CARD FLIPS A PAIR (the headline done-criterion). When the human validates a
 * decision card with the option `fix_below_wall` (the below-the-line repair the cockpit may act
 * on directly), the addressed pair transitions 🔴→🟢 deterministically (`applyCardValidation`).
 * An above-the-line option (change_above_wall / block / …) does NOT flip a pair from the cockpit —
 * it OPENS a goal (the wall §2). The transition is a PURE function of (report, cardId, option).
 *
 * CLICKING A PAIR SCOPES LEFT + RIGHT (the done-criterion). `scopeForPair` resolves a pair key to
 * the deterministic scope of the left chat (the node + facet it talks about) and the right cards
 * (the cards addressing that pair). Same pair ⇒ same scope.
 *
 * DETERMINISM-FIRST (CLAUDE.md §6/§8). proposeSlot / refuseTruthWrite / scopeForPair /
 * applyCardValidation / buildCockpit are PURE + TOTAL: same input ⇒ same output, invariant under
 * input ordering. NO LLM enters this module — the cockpit's gaps are SemanticDiff/blast (FK09),
 * never an "LLM diff agent". This twin carries its own reproducibility property (ai-lab.test.ts).
 * THE WALL (§2): it reads sourced verdicts + a node and writes NOTHING — the cockpit is a
 * projection; truth-writes go idea → mirror → /goal.
 */

import {
	type ConsciousnessReport,
	type DecisionCard,
	type PairVerdict,
	reconcile,
} from "./conscience";
import type { Facet } from "./facetwire";

/** The two cockpit modes (FKE-38): same screen, different zoom. A render hint, never a truth. */
export type Mode = "conversational" | "navigational";
export const MODES: Mode[] = ["conversational", "navigational"];

/** The wall tier of a cockpit cell (§2): above the line = propose-only ; below = acts directly. */
export type WallTier = "above" | "below";

/**
 * The above-the-line record kinds (kernel/mirrors/fitness — the wall). Anything else the cockpit
 * touches is below the line (projections/archive) and read-only FROM the cockpit. DECLARED.
 */
export const ABOVE_THE_LINE_KINDS = [
	"entity",
	"policy",
	"operation",
	"control",
	"action",
	"expr",
	"invariant",
	"mirror",
] as const;
export type AboveKind = (typeof ABOVE_THE_LINE_KINDS)[number];

/** The voyant per pair: 🟢 green / 🔴 red / 🟡 amber (advisory or proposed). */
export type Voyant = "green" | "red" | "amber";

/** A node the cockpit is scoped to (CENTRE selection drives GAUCHE + DROITE). */
export interface CockpitNode {
	id: string;
	kind: string;
	facet: Facet;
}

/** The wall tier of a node kind — a pure lookup over the DECLARED above-the-line set. */
export function wallTier(kind: string): WallTier {
	return (ABOVE_THE_LINE_KINDS as readonly string[]).includes(kind)
		? "above"
		: "below";
}

/**
 * The judge sources whose verdicts address an ABOVE-the-line truth (kernel/mirror) — the cockpit
 * may only PROPOSE here (the wall §2). Every other source reads BELOW-the-line evidence /
 * projections (sensors, reality, ledger) — READ-ONLY from the cockpit (it acts directly
 * elsewhere). DECLARED, deterministic — this is how the wall is DRAWN per pair.
 */
export const ABOVE_THE_LINE_SOURCES = [
	"runner",
	"completeness",
	"facet",
	"semantic_diff",
] as const;

/** The wall tier of a pair, from the judge that produced it — the DRAWN wall (pure + total). */
export function pairTier(source: string): WallTier {
	return (ABOVE_THE_LINE_SOURCES as readonly string[]).includes(source)
		? "above"
		: "below";
}

/** Map a PairVerdict's verdict to its cockpit voyant (advisory → amber). */
export function voyantFor(p: PairVerdict): Voyant {
	if (p.verdict === "green") return "green";
	if (p.verdict === "advisory") return "amber";
	return "red";
}

/** The stable, content-addressed key of a pair (the CENTRE voyant + the click target). */
export function pairKey(
	p: Pick<PairVerdict, "facet" | "pair" | "source">,
): string {
	return `${p.facet}:${p.pair}:${p.source}`;
}

// ── GAUCHE — the chat proposes slots, never a truth ──────────────────────────

/** A slot the chat PROPOSES (amber). status is always "proposed" — never a truth. */
export interface ProposedSlot {
	id: string;
	nodeId: string;
	facet: Facet;
	intent: string;
	status: "proposed";
	voyant: "amber";
}

/** A stable FNV-1a 32-bit hash for the content-addressed slot ID (no clock, no rng). */
function hashStr(s: string): string {
	let h = 0x811c9dc5;
	for (let i = 0; i < s.length; i++) {
		h ^= s.charCodeAt(i);
		h = Math.imul(h, 0x01000193) >>> 0;
	}
	return h.toString(16).padStart(8, "0");
}

/**
 * The closed set of phrasings that ASK FOR A DIRECT TRUTH WRITE — refused at the wall. A chat
 * message matching one of these never proposes a slot; it returns a refusal (the only door is
 * idea → mirror → /goal). DECLARED, deterministic — no LLM judges the intent.
 */
const TRUTH_WRITE_MARKERS = [
	"écris la vérité",
	"écris le kernel",
	"write the kernel",
	"write truth",
	"modifie le kernel",
	"edit the mirror",
	"modifie le miroir",
	"freeze",
	"gèle la vérité",
];

/** Does a chat message demand a direct truth write (refused at the wall §2)? Pure + total. */
export function isTruthWriteRequest(message: string): boolean {
	const m = message.toLowerCase();
	return TRUTH_WRITE_MARKERS.some((mk) => m.includes(mk));
}

/** The actionable refusal when the chat tries to write a truth directly (the wall §2). */
export interface WallRefusal {
	refused: true;
	code: "AI_LAB_DIRECT_TRUTH_WRITE";
	explanation: string;
	howToFix: string[];
}

/**
 * proposeSlot is the GAUCHE chat gesture: a chat message scoped to a node either PROPOSES an
 * amber slot (a candidate, never a truth) or is REFUSED at the wall if it demands a direct truth
 * write. PURE + TOTAL + content-addressed (same message + node ⇒ same slot ID). NO LLM enters.
 */
export function proposeSlot(
	node: CockpitNode,
	message: string,
): ProposedSlot | WallRefusal {
	if (isTruthWriteRequest(message)) {
		return {
			refused: true,
			code: "AI_LAB_DIRECT_TRUTH_WRITE",
			explanation:
				"Le chat de l'AI Lab PROPOSE des slots, il n'écrit jamais la vérité. " +
				"Une écriture directe du kernel ou d'un miroir est refusée au mur (§2).",
			howToFix: [
				"Capturez l'intention comme une idée (idea-intake).",
				"Dérivez son miroir (write-bdd-scenario).",
				"Ouvrez un /goal — la promotion passe par la décision humaine.",
			],
		};
	}
	const intent = message.trim();
	const id = `SLOT-${hashStr(`${node.id}|${node.facet}|${intent}`)}`;
	return {
		id,
		nodeId: node.id,
		facet: node.facet,
		intent,
		status: "proposed",
		voyant: "amber",
	};
}

// ── DROITE — validating a card flips a pair (deterministic transition) ────────

/** The cockpit options that ACT BELOW the wall directly (the only ones the cockpit may apply). */
export const BELOW_WALL_OPTIONS = ["fix_below_wall"] as const;

/** Does a card option act below the wall (the cockpit may apply it) or open a goal above it? */
export function isBelowWallOption(option: string): boolean {
	return (BELOW_WALL_OPTIONS as readonly string[]).includes(option);
}

/** The result of validating a decision card from the cockpit. */
export interface CardValidation {
	applied: boolean;
	report: ConsciousnessReport;
	flippedPair?: string;
	/** when the chosen option is above the wall, the cockpit opens a goal instead of acting. */
	openedGoal?: boolean;
	reason?: string;
}

/**
 * applyCardValidation is the DROITE gesture: validating a decision card with a BELOW-the-wall
 * option (`fix_below_wall`) flips the addressed pair 🔴→🟢 deterministically and re-reconciles
 * the report (so the verdict + remaining cards recompute from the SAME aggregator, FK09). An
 * ABOVE-the-wall option (change_above_wall / block / …) does NOT flip a pair — it OPENS a goal
 * (the wall §2). PURE + TOTAL: same (report, cardId, option) ⇒ same result.
 */
export function applyCardValidation(
	report: ConsciousnessReport,
	cardId: string,
	option: string,
): CardValidation {
	const card = report.cards.find((c) => c.id === cardId);
	if (!card) {
		return { applied: false, report, reason: `carte inconnue : ${cardId}` };
	}
	if (!isBelowWallOption(option)) {
		// above the wall: the cockpit proposes, it never writes truth (§2).
		return {
			applied: false,
			report,
			openedGoal: true,
			reason:
				"option au-dessus du mur — la carte ouvre un /goal (idea → mirror → /goal), " +
				"le cockpit n'écrit aucune vérité.",
		};
	}
	// Below the wall: repair the addressed pair. We rebuild the input verdicts from the report's
	// own pairs, flipping the addressed red pair to green, then re-reconcile (FK09 aggregator).
	const target = pairKeyOf(card);
	let flipped = false;
	const verdicts = report.pairs.map((p) => {
		const isTarget = pairKeyOf(p) === target && p.verdict === "red";
		if (isTarget) flipped = true;
		return {
			source: p.source,
			facet: p.facet,
			pair: p.pair,
			verdict: isTarget ? ("green" as const) : p.verdict,
			drift: isTarget ? undefined : p.drift,
			detail: isTarget ? undefined : p.detail,
			blast: p.blast,
		};
	});
	const next = reconcile({ kernel_id: report.kernel_id, verdicts });
	return {
		applied: flipped,
		report: next,
		flippedPair: flipped ? target : undefined,
	};
}

/** The content key of a card or a pair (shared so a card maps to the pair it addresses). */
function pairKeyOf(
	x: Pick<DecisionCard | PairVerdict, "facet" | "pair" | "source">,
): string {
	return `${x.facet}:${x.pair}:${x.source}`;
}

// ── CENTRE click → scope GAUCHE + DROITE (deterministic) ─────────────────────

/** The scope a clicked pair resolves to: the left chat node + the right cards (FKE-38). */
export interface PairScope {
	pairKey: string;
	facet: Facet;
	pair: string;
	source: string;
	tier: WallTier;
	/** GAUCHE — the chat is scoped to this facet+pair. */
	chatScope: { facet: Facet; pair: string };
	/** DROITE — the decision cards addressing this pair. */
	cardIds: string[];
	voyant: Voyant;
}

/**
 * scopeForPair is the CENTRE→GAUCHE+DROITE gesture: clicking a pair voyant resolves the
 * deterministic scope of the left chat (the facet+pair it talks about) and the right cards (those
 * addressing the pair). PURE + TOTAL: same (report, pairKey) ⇒ same scope. The chat is SCOPED to
 * the node, never given the whole kernel (the ContextRouter is an algorithm, not a prompt, §8).
 */
export function scopeForPair(
	report: ConsciousnessReport,
	key: string,
): PairScope | undefined {
	const p = report.pairs.find((q) => pairKey(q) === key);
	if (!p) return undefined;
	const cardIds = report.cards
		.filter((c) => pairKeyOf(c) === key)
		.map((c) => c.id)
		.sort();
	return {
		pairKey: key,
		facet: p.facet,
		pair: p.pair,
		source: p.source,
		tier: pairTier(p.source),
		chatScope: { facet: p.facet, pair: p.pair },
		cardIds,
		voyant: voyantFor(p),
	};
}

// ── The whole cockpit state (CENTRE + GAUCHE + DROITE), one zoomable screen ──

/** A CENTRE pair cell carrying its voyant + wall tier — the navigable layer's atom. */
export interface PairCell {
	key: string;
	facet: Facet;
	pair: string;
	source: string;
	voyant: Voyant;
	tier: WallTier;
	/** below the wall is READ-ONLY from the cockpit (acts directly elsewhere). */
	readOnly: boolean;
}

/** The promotion gate (DROITE, FK10): a declared autonomy level + whether it may rise. */
export interface PromotionGate {
	level: number;
	canPromote: boolean;
	nextLevel: number;
}

export interface CockpitState {
	kernel_id: string;
	mode: Mode;
	node?: CockpitNode;
	/** CENTRE — the navigable layer: one cell per pair of every instantiated facet. */
	cells: PairCell[];
	/** DROITE — the decision cards + the red-wave (red pairs) + the blast radii. */
	cards: DecisionCard[];
	redWave: string[];
	blast: Record<string, string>;
	gate?: PromotionGate;
	verdict: "aligned" | "drift";
	green: number;
	red: number;
	amber: number;
}

/**
 * buildCockpit composes the FK09 conscience report + the optional node + mode + promotion gate
 * into the whole zoomable cockpit state: the CENTRE pair cells (with voyant + wall tier +
 * read-only flag), the DROITE cards + red-wave + blast radii. PURE + TOTAL: same input ⇒ same
 * state, deterministic ordering (by pair key). NO LLM enters — every cell is a copied verdict.
 */
export function buildCockpit(args: {
	report: ConsciousnessReport;
	mode?: Mode;
	node?: CockpitNode;
	gate?: PromotionGate;
}): CockpitState {
	const { report } = args;
	const cells: PairCell[] = report.pairs
		.map((p) => {
			const tier = pairTier(p.source);
			return {
				key: pairKey(p),
				facet: p.facet,
				pair: p.pair,
				source: p.source,
				voyant: voyantFor(p),
				tier,
				readOnly: tier === "below",
			};
		})
		.sort((a, b) => (a.key < b.key ? -1 : a.key > b.key ? 1 : 0));

	const redWave = report.pairs
		.filter((p) => p.verdict === "red")
		.map((p) => pairKey(p))
		.sort();

	const blast: Record<string, string> = {};
	for (const c of report.cards) blast[c.id] = c.blast;

	let amber = 0;
	for (const c of cells) if (c.voyant === "amber") amber++;

	return {
		kernel_id: report.kernel_id,
		mode: args.mode ?? "navigational",
		node: args.node,
		cells,
		cards: report.cards,
		redWave,
		blast,
		gate: args.gate,
		verdict: report.verdict,
		green: report.green,
		red: report.red,
		amber,
	};
}

// ── The 6×6 GRID — the generative surface (FKE-38, corrected) ─────────────────
//
// The AI Lab is a SPEC GENERATOR, not a navigation cockpit. On the LEFT, a natural-language
// chat GENERATES the SPECS — the ABOVE-the-wall half of each mirror-pair. On the RIGHT, the
// 6×6 grid: 6 mirror-pairs (rows) × facets (columns). Each cell carries its generated spec
// (above the wall) and its MACHINE — the executable mirror/test (below the wall) — with the
// live conscience voyant. « Les machines que ça change » = exactly these below-wall mirrors.

/**
 * The 6 mirror-pairs (FKE-1.3): the chat generates the ABOVE side (the spec); the BELOW side
 * (the machine = mirror/test) is its executable reflection shown on the right. Ordered, declared.
 */
export interface MirrorPair {
	id: string;
	/** the SPEC side label — generated by the chat, ABOVE the wall. */
	above: string;
	/** the MACHINE side label — the mirror/test, BELOW the wall (read-only from the lab). */
	below: string;
}
export const MIRROR_PAIRS: MirrorPair[] = [
	{ id: "spec", above: "Spec", below: "Documentation" },
	{ id: "behavior", above: "Comportement", below: "Résultats" },
	{ id: "scenarios", above: "Scénarios", below: "Tests" },
	{ id: "model", above: "Modèle", below: "Projection-données" },
	{ id: "contract", above: "Contrat", below: "Code" },
	{ id: "evidence", above: "Evidence-attendue", below: "Evidence-observée" },
];

/** A spec the chat GENERATED above the wall in a grid cell (amber proposal, never a truth). */
export interface GeneratedSpec {
	id: string;
	pairId: string;
	facet: Facet;
	/** the spec text the left brain compiled from the chat message (the ABOVE-wall content). */
	text: string;
	status: "proposed";
}

/** The stable per-cell key of the 6×6 (a mirror-pair × a facet). */
export function cellKey(pairId: string, facet: Facet): string {
	return `${pairId}@${facet}`;
}

/** One cell of the 6×6: a mirror-pair (row) × a facet (column). */
export interface GridCell {
	key: string;
	pairId: string;
	/** spec-side label (above the wall). */
	above: string;
	/** machine-side label (below the wall — the mirror/test). */
	below: string;
	facet: Facet;
	/** the chat-generated spec ABOVE the wall (amber), if any. */
	spec?: GeneratedSpec;
	/** the MACHINE's live voyant BELOW the wall (🟢 aligned / 🔴 diverge / 🟡 declared-only). */
	voyant: Voyant;
}

/**
 * generateSpecs is the LEFT (chat) gesture, corrected to FKE-38: a natural-language message
 * scoped to a facet GENERATES the specs across the 6 mirror-pairs of that facet (a COLUMN of the
 * 6×6) — the ABOVE-the-wall side. A message demanding a direct truth-write is REFUSED at the wall
 * (the only door is idea → mirror → /goal). PURE + TOTAL + content-addressed: same (message,
 * facet) ⇒ byte-identical specs. NO LLM enters this twin — it pins the STRUCTURE (placement +
 * id); the prose compilation is the gated runtime exception, checked against this shape.
 */
export function generateSpecs(
	facet: Facet,
	message: string,
): GeneratedSpec[] | WallRefusal {
	if (isTruthWriteRequest(message)) {
		return {
			refused: true,
			code: "AI_LAB_DIRECT_TRUTH_WRITE",
			explanation:
				"Le chat de l'AI Lab GÉNÈRE des specs (au-dessus du mur), il n'écrit jamais la vérité. " +
				"Une écriture directe du kernel ou d'un miroir est refusée au mur (§2).",
			howToFix: [
				"Capturez l'intention comme une idée (idea-intake).",
				"Dérivez son miroir (write-bdd-scenario).",
				"Ouvrez un /goal — la promotion passe par la décision humaine.",
			],
		};
	}
	const intent = message.trim();
	return MIRROR_PAIRS.map((p) => ({
		id: `SPEC-${hashStr(`${p.id}|${facet}|${intent}`)}`,
		pairId: p.id,
		facet,
		text: `${p.above} [${facet}] ⟵ « ${intent} »`,
		status: "proposed" as const,
	}));
}

/**
 * buildGrid composes the 6×6: 6 mirror-pairs (rows) × the given facets (columns). Each cell
 * carries its generated spec (above the wall) and its MACHINE voyant (below): 🔴 if the cell is
 * in `divergent` (the machine diverges from the spec — a real red the conscience computed), 🟢 if
 * a spec is generated and the machine reflects it, 🟡 if the anatomy slot is declared but no spec
 * is generated yet (under-proven). PURE + TOTAL: same input ⇒ same grid, ordered (pair order ×
 * facet order). NO LLM — every voyant is a calculation (the conscience, §8).
 */
export function buildGrid(args: {
	facets: Facet[];
	specs?: GeneratedSpec[];
	divergent?: string[];
}): GridCell[] {
	const specByCell = new Map<string, GeneratedSpec>();
	for (const s of args.specs ?? [])
		specByCell.set(cellKey(s.pairId, s.facet), s);
	const red = new Set(args.divergent ?? []);
	const cells: GridCell[] = [];
	for (const p of MIRROR_PAIRS) {
		for (const facet of args.facets) {
			const key = cellKey(p.id, facet);
			const spec = specByCell.get(key);
			const voyant: Voyant = red.has(key) ? "red" : spec ? "green" : "amber";
			cells.push({
				key,
				pairId: p.id,
				above: p.above,
				below: p.below,
				facet,
				spec,
				voyant,
			});
		}
	}
	return cells;
}

// ── The conversation — discuter avec le cerveau gauche (FKE-38) ───────────────
//
// The left pane is a real multi-turn CHAT. A turn is a user message or the left-brain's reply.
// The reply is a STRUCTURED, DETERMINISTIC value (a key + params) so the panel renders it
// bilingually via next-intl — the irreducible prose compilation is the gated runtime exception,
// never this twin. The conversation drives the 6×6 on the right.

/** A single turn in the chat thread. */
export interface ChatTurn {
	id: string;
	role: "user" | "assistant";
	/** for a user turn: the raw message. for an assistant turn: empty (rendered from `reply`). */
	text: string;
	/** for an assistant turn: the structured, i18n-rendered reply. */
	reply?: AssistantReply;
}

/**
 * The left-brain's structured reply — a translation key + params (rendered by the panel via
 * next-intl). Deterministic: the same (facet, message, grid) ⇒ the same reply. No LLM in the twin.
 */
export type AssistantReply =
	| { kind: "greeting" }
	| { kind: "refused" }
	| {
			kind: "generated";
			facet: Facet;
			/** how many specs were posted above the wall (one per mirror-pair). */
			specs: number;
			/** how many machines in this facet column still diverge 🔴 (the conscience). */
			divergent: number;
	  }
	/** the deterministic twin answered (real Claude unavailable) — honesty about the brain. */
	| { kind: "fallback"; placed: number };

/**
 * assistantReply is the left-brain's TURN: from a chat message scoped to a facet + the resulting
 * grid, it produces the structured reply. A truth-write demand → a refusal turn (the wall §2). A
 * normal message → a "generated" turn stating the specs posted above the wall + any divergent
 * machine below it. PURE + TOTAL + deterministic: same input ⇒ same reply. NO LLM in this twin.
 */
export function assistantReply(
	facet: Facet,
	message: string,
	gridForFacet: GridCell[],
): AssistantReply {
	if (isTruthWriteRequest(message)) return { kind: "refused" };
	const inColumn = gridForFacet.filter((c) => c.facet === facet);
	const specs = inColumn.filter((c) => c.spec).length;
	const divergent = inColumn.filter((c) => c.voyant === "red").length;
	return { kind: "generated", facet, specs, divergent };
}

/** A stable id for a chat turn at a given position (append-only — never reordered). */
export function turnId(index: number, role: ChatTurn["role"]): string {
	return `T${index}-${role}`;
}

// ── The placement space — the chat acts on ALL levels (verticale × fractale) ──
//
// CORRECTION (the owner): the chat does NOT pick a facet/level. It acts on the WHOLE verticale;
// the INTELLIGENCE (the left brain — a real Claude, gated) decides WHERE to put each piece of a
// need: which LEVEL, which FACET, which mirror-PAIR. The placement is the LLM's irreducible
// judgment, VERIFIED here (clamped to the declared target space; the wall: proposes, never writes).

/** The verticale — the 7 levels a need fans out across (S-vertical, produit → entité). */
export const VERTICAL_LEVELS = [
	"produit",
	"parcours",
	"vue",
	"contrôle",
	"action",
	"opération",
	"entité",
] as const;
export type Level = (typeof VERTICAL_LEVELS)[number];

/** The full facet set the left brain may target (F·I·S·B·R·V·M·X). */
export const ALL_FACETS: Facet[] = ["F", "I", "S", "B", "R", "V", "M", "X"];

/** The lifecycle of a placed spec: proposed (above the wall) → validated (descends a notch) →
 *  realized (crossed the wall, at the bottom of the verticale). DECLARED. */
export type SpecStatus = "proposed" | "validated" | "realized";

/** A placement the left brain PROPOSES: a generated spec dropped at level × facet × pair. */
export interface Placement {
	level: Level;
	facet: Facet;
	pairId: string;
	/** the spec text (above the wall) the left brain compiled for this cell (the short form). */
	spec: string;
	/** the DETAILED spec (criteria / longer text) — shown when the spec is expanded. */
	detail?: string;
	/** the lifecycle status — defaults to "proposed". Validating descends it a notch. */
	status?: SpecStatus;
	/** an optional fractal sub-kernel the placement nests under (e.g. "checkout/cart"). */
	kernel?: string;
}

function isLevel(x: unknown): x is Level {
	return (VERTICAL_LEVELS as readonly string[]).includes(x as string);
}
function isFacet(x: unknown): x is Facet {
	return (ALL_FACETS as readonly string[]).includes(x as string);
}
function isPairId(x: unknown): boolean {
	return MIRROR_PAIRS.some((p) => p.id === x);
}

/**
 * validatePlacements GATES the left brain's output (determinism-first §8): the LLM PROPOSES
 * placements, but only those whose (level, facet, pairId) are in the DECLARED target space
 * survive — an invented level/facet/pair is dropped, never coerced. Pure + total. The spec text is
 * trimmed + length-capped (never executed, never written to truth — the wall §2). Deterministic:
 * same raw input ⇒ same kept placements (stable order: level, facet, pair).
 */
export function validatePlacements(raw: unknown): Placement[] {
	if (!Array.isArray(raw)) return [];
	const kept: Placement[] = [];
	for (const r of raw) {
		if (!r || typeof r !== "object") continue;
		const o = r as Record<string, unknown>;
		if (!isLevel(o.level) || !isFacet(o.facet) || !isPairId(o.pairId)) continue;
		const spec = typeof o.spec === "string" ? o.spec.trim().slice(0, 280) : "";
		if (!spec) continue;
		const placement: Placement = {
			level: o.level,
			facet: o.facet,
			pairId: o.pairId as string,
			spec,
		};
		if (typeof o.detail === "string" && o.detail.trim())
			placement.detail = o.detail.trim().slice(0, 600);
		if (o.status === "validated" || o.status === "realized")
			placement.status = o.status;
		if (typeof o.kernel === "string" && o.kernel.trim())
			placement.kernel = o.kernel.trim().slice(0, 60);
		kept.push(placement);
	}
	const lvl = (l: Level) => VERTICAL_LEVELS.indexOf(l);
	const fct = (f: Facet) => ALL_FACETS.indexOf(f);
	const par = (p: string) => MIRROR_PAIRS.findIndex((m) => m.id === p);
	kept.sort(
		(a, b) =>
			lvl(a.level) - lvl(b.level) ||
			fct(a.facet) - fct(b.facet) ||
			par(a.pairId) - par(b.pairId),
	);
	return kept;
}

/** Group placements by level (the verticale) for the right-pane render. Deterministic. */
export function placementsByLevel(
	placements: Placement[],
): { level: Level; items: Placement[] }[] {
	return VERTICAL_LEVELS.map((level) => ({
		level,
		items: placements.filter((p) => p.level === level),
	}));
}

/** The dedup key of a placement cell (level × facet × pair × kernel). */
export function placementKey(p: Placement): string {
	return `${p.level}|${p.facet}|${p.pairId}|${p.kernel ?? ""}`;
}

// ── The EXISTING DAG — where a need impacts what is ALREADY there (the red wave) ──
//
// A need does not only CREATE specs ; it can TOUCH the existing DAG (S22 impact / S24 version DAG).
// The left brain identifies WHICH existing specs the need impacts ; the right pane shows the new
// specs AND the impacted existing ones (the red wave on the existing graph). VERIFIED: an impact is
// kept only if it names a REAL existing spec id (no invented node), the wall holds (propose-only).

/** An existing spec already in the project's DAG (a demo seed of the checkout project). */
export interface ExistingSpec {
	id: string;
	level: Level;
	facet: Facet;
	pairId: string;
	title: string;
}

/**
 * EXISTING_DAG — a representative seed of the CURRENT project's specs across the verticale (the
 * checkout app). DECLARED + deterministic. (Wiring the real versioned DAG — S24 — is a follow-up.)
 */
export const EXISTING_DAG: ExistingSpec[] = [
	{
		id: "d-produit-shop",
		level: "produit",
		facet: "F",
		pairId: "spec",
		title: "Boutique — vendre des articles en ligne",
	},
	{
		id: "d-parcours-buy",
		level: "parcours",
		facet: "F",
		pairId: "scenarios",
		title: "Parcours d'achat — du panier au reçu",
	},
	{
		id: "d-vue-cart",
		level: "vue",
		facet: "X",
		pairId: "spec",
		title: "Vue panier — liste des articles + total",
	},
	{
		id: "d-controle-pay",
		level: "contrôle",
		facet: "F",
		pairId: "contract",
		title: "Bouton Payer — déclenche le checkout",
	},
	{
		id: "d-action-checkout",
		level: "action",
		facet: "S",
		pairId: "behavior",
		title: "Checkout — paiement atomique",
	},
	{
		id: "d-operation-createorder",
		level: "opération",
		facet: "F",
		pairId: "behavior",
		title: "createOrder — valider + persister la commande",
	},
	{
		id: "d-operation-reserve",
		level: "opération",
		facet: "B",
		pairId: "behavior",
		title: "reserveStock — réserver le stock à l'ajout au panier",
	},
	{
		id: "d-entite-order",
		level: "entité",
		facet: "F",
		pairId: "model",
		title: "Order — id, total, lignes",
	},
	{
		id: "d-entite-cart",
		level: "entité",
		facet: "V",
		pairId: "model",
		title: "Cart — articles, propriétaire",
	},
];

/** An impact the left brain PROPOSES: a need touches an EXISTING DAG spec (the red wave). */
export interface DagImpact {
	/** the id of the impacted existing spec (must be a real EXISTING_DAG id). */
	specId: string;
	/** why the need touches it (the left brain's reason). */
	reason: string;
}

/**
 * validateImpacts GATES the left brain's impact list: an impact is kept ONLY if its specId names a
 * REAL existing spec (an invented node is dropped, never coerced) ; the reason is trimmed + capped.
 * PURE + TOTAL + deterministic (ordered by the EXISTING_DAG order). The wall §2: nothing written.
 */
export function validateImpacts(raw: unknown): DagImpact[] {
	if (!Array.isArray(raw)) return [];
	const ids = new Set(EXISTING_DAG.map((s) => s.id));
	const seen = new Set<string>();
	const kept: DagImpact[] = [];
	for (const r of raw) {
		if (!r || typeof r !== "object") continue;
		const o = r as Record<string, unknown>;
		if (typeof o.specId !== "string" || !ids.has(o.specId)) continue;
		if (seen.has(o.specId)) continue;
		seen.add(o.specId);
		const reason =
			typeof o.reason === "string" ? o.reason.trim().slice(0, 200) : "";
		kept.push({ specId: o.specId, reason });
	}
	const order = (id: string) => EXISTING_DAG.findIndex((s) => s.id === id);
	kept.sort((a, b) => order(a.specId) - order(b.specId));
	return kept;
}

/** Merge impacts across turns (dedupe by specId, latest reason wins, re-ordered). Pure. */
export function mergeImpacts(
	prev: DagImpact[],
	next: DagImpact[],
): DagImpact[] {
	const byId = new Map<string, DagImpact>();
	for (const i of prev) byId.set(i.specId, i);
	for (const i of next) byId.set(i.specId, i);
	return validateImpacts([...byId.values()]);
}

/** Look up an existing spec by id (for the right-pane render). */
export function existingSpec(id: string): ExistingSpec | undefined {
	return EXISTING_DAG.find((s) => s.id === id);
}

/**
 * mergePlacements accumulates the conversation's placements: a later turn's placement for the
 * SAME cell (level × facet × pair × kernel) OVERRIDES the earlier spec (the chat refines), others
 * are kept. Re-sorted to the canonical order. PURE + TOTAL + deterministic.
 */
export function mergePlacements(
	prev: Placement[],
	next: Placement[],
): Placement[] {
	const byKey = new Map<string, Placement>();
	for (const p of prev) byKey.set(placementKey(p), p);
	for (const p of next) byKey.set(placementKey(p), p);
	return validatePlacements([...byKey.values()]);
}

// ── The DESCENT — validate a pair → generate the next pair DOWN THE ANATOMY ──
//
// « Descendre un cran » = descend the 6 mirror-pairs (NOT the verticale): valider Spec → génère
// Comportement → valider Comportement → Scénarios → Modèle → Contrat → Evidence. Per facet
// (F·I·S·B·R·V·M·X), per (level × facet) CELL of the big table. DETERMINISM-FIRST (§6): the
// pair-to-pair refinement is a PURE function (a known chain), so it MUST be code — never an LLM.
// (The irreducible NL→placement stays Claude's job ; the descent is mechanical.)

/** The next mirror-pair down the anatomy, or undefined if pairId is the last (evidence). */
export function nextPairId(pairId: string): string | undefined {
	const i = MIRROR_PAIRS.findIndex((p) => p.id === pairId);
	return i >= 0 && i < MIRROR_PAIRS.length - 1
		? MIRROR_PAIRS[i + 1].id
		: undefined;
}

/** The label of the spec a pair carries when DERIVED from the pair above it (deterministic chain). */
const PAIR_DERIVATION: Record<string, string> = {
	behavior: "Comportement attendu",
	scenarios: "Scénarios Given/When/Then",
	model: "Modèle de données",
	contract: "Contrat (in/out, pré/post, invariants)",
	evidence: "Evidence attendue",
};

/** deriveNextSpec — the pure derivation of the next pair's spec from the validated one. */
export function deriveNextSpec(toPairId: string, parentSpec: string): string {
	const label = PAIR_DERIVATION[toPairId] ?? toPairId;
	return `${label} — dérivé de : ${parentSpec}`;
}

/** The ordered 6-pair anatomy of one CELL (level × facet), in MIRROR_PAIRS order. */
export function cellPlacements(
	placements: Placement[],
	level: Level,
	facet: Facet,
): Placement[] {
	return placements
		.filter((p) => p.level === level && p.facet === facet)
		.sort(
			(a, b) =>
				MIRROR_PAIRS.findIndex((m) => m.id === a.pairId) -
				MIRROR_PAIRS.findIndex((m) => m.id === b.pairId),
		);
}

/**
 * validateAndDescend — validate the pair (level × facet × pairId) and GENERATE the next pair down
 * the anatomy (deterministic). At the last pair (evidence) it marks the pair "realized" (descent
 * complete, crossed the wall). PURE + TOTAL + idempotent: re-validating yields the same result; an
 * unknown cell is a no-op. The wall §2: this stages a lab proposal, it writes NO truth (promotion
 * stays /goal). matched by (level, facet, pairId), ignoring the fractal kernel.
 */
export function validateAndDescend(
	placements: Placement[],
	level: Level,
	facet: Facet,
	pairId: string,
): Placement[] {
	const target = placements.find(
		(p) => p.level === level && p.facet === facet && p.pairId === pairId,
	);
	if (!target) return placements;
	const next = nextPairId(pairId);
	const updated = placements.map((p) =>
		p.level === level && p.facet === facet && p.pairId === pairId
			? { ...p, status: (next ? "validated" : "realized") as SpecStatus }
			: p,
	);
	if (!next) return mergePlacements(updated, []);
	const child: Placement = {
		level,
		facet,
		pairId: next,
		spec: deriveNextSpec(next, target.spec),
		status: "proposed",
	};
	return mergePlacements(updated, [child]);
}
