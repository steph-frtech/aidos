"use server";

import { execFile } from "node:child_process";
import { promisify } from "node:util";
import {
	applyCardValidation,
	buildCockpit,
	type ChatTurn,
	type CockpitNode,
	isTruthWriteRequest,
	MIRROR_PAIRS,
	type Mode,
	mergePlacements,
	type Placement,
	proposeSlot,
	scopeForPair,
	turnId,
	VERTICAL_LEVELS,
	validatePlacements,
} from "@/lib/ai-lab";
import type { Facet } from "@/lib/facetwire";
import {
	type CockpitView,
	DEFAULT_MODE,
	emptyView,
	type LabView,
	SAMPLE_GATE,
	scenario,
} from "./fixtures";

const execFileP = promisify(execFile);
/** The Claude Code CLI wired behind the chat (the « cerveau gauche »). Overridable. */
const CLAUDE_BIN =
	process.env.AIDOS_CLAUDE_BIN || "/home/stevig/.local/bin/claude";

/** The left-brain prompt: a need → JSON placements across the verticale (propose-only, the wall). */
function leftBrainPrompt(message: string): string {
	return [
		"Tu es le CERVEAU GAUCHE d'AIDOS (Fractal Kernel Engineering).",
		"Tu reçois un BESOIN en langage naturel et tu l'ÉCLATES en specs PROPOSÉES, placées aux bons endroits.",
		"Tu PROPOSES seulement ; tu n'écris JAMAIS la vérité (le mur). Si on te demande d'écrire/figer le kernel ou un miroir, refuse.",
		"",
		"Espace de placement :",
		`- NIVEAU (verticale) ∈ {${VERTICAL_LEVELS.join(", ")}}`,
		"- FACETTE ∈ {F=fonctionnel, I=invariants, S=sécurité, B=perf/budgets, R=fiabilité, V=évolutivité, M=maintenabilité/archi, X=expérience}",
		`- PAIRE-MIROIR ∈ {${MIRROR_PAIRS.map((p) => p.id).join(", ")}}`,
		"",
		"Décide À QUELS niveaux le besoin touche (souvent plusieurs), et pour chacun la facette + la paire-miroir, avec un texte de spec court (1 phrase, en français).",
		"Réponds UNIQUEMENT par un objet JSON valide, sans aucun texte autour, de la forme :",
		'{"reply":"<1-2 phrases conversationnelles en français>","placements":[{"level":"...","facet":"F","pairId":"spec","spec":"..."}]}',
		"",
		`Besoin : "${message.replace(/"/g, "'")}"`,
	].join("\n");
}

/** Pull the JSON object out of a model answer that may carry prose / ``` fences. */
function extractJson(text: string): string {
	const a = text.indexOf("{");
	const b = text.lastIndexOf("}");
	return a >= 0 && b > a ? text.slice(a, b + 1) : "";
}

/** Call the real Claude (CLI) — returns null on any failure (caller falls back). */
async function callClaude(
	message: string,
): Promise<{ reply: string; placements: Placement[] } | null> {
	try {
		const { stdout } = await execFileP(
			CLAUDE_BIN,
			[
				"-p",
				leftBrainPrompt(message),
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
		const placements = validatePlacements(inner?.placements);
		const reply = typeof inner?.reply === "string" ? inner.reply.trim() : "";
		if (!reply && placements.length === 0) return null;
		return { reply, placements };
	} catch {
		return null;
	}
}

/** Deterministic fallback when Claude is unavailable: place the 6 pairs at opération/F. */
function fallbackPlacements(message: string): Placement[] {
	const intent = message.trim().slice(0, 120);
	return MIRROR_PAIRS.map((p) => ({
		level: "opération" as const,
		facet: "F" as Facet,
		pairId: p.id,
		spec: `${p.above} ⟵ « ${intent} »`,
	}));
}

/**
 * leftBrainAction — the chat's turn, wired to the REAL Claude (CLI). A need fans out across the
 * verticale: Claude decides WHERE each spec goes (level × facet × pair) — the irreducible judgment
 * (§6/§8 gated exception), then VERIFIED (validatePlacements clamps to the declared space; the wall
 * §2: propose-only, a truth-write is refused before any LLM call). On any CLI failure it falls back
 * to the deterministic twin (mode "fallback"), never an opaque error. State accumulates via `prev`.
 */
export async function leftBrainAction(
	prev: LabView,
	formData: FormData,
): Promise<LabView> {
	const message = String(formData.get("message") ?? "")
		.trim()
		.slice(0, 600);
	if (!message) return { ...prev, error: "message vide" };

	const n = prev.thread.length;
	const userTurn: ChatTurn = {
		id: turnId(n, "user"),
		role: "user",
		text: message,
	};
	const asst = (turn: Partial<ChatTurn>): ChatTurn => ({
		id: turnId(n + 1, "assistant"),
		role: "assistant",
		text: "",
		...turn,
	});

	// THE WALL (§2): a direct truth-write is refused BEFORE any LLM call.
	if (isTruthWriteRequest(message)) {
		return {
			...prev,
			thread: [...prev.thread, userTurn, asst({ reply: { kind: "refused" } })],
			error: undefined,
		};
	}

	const out = await callClaude(message);
	if (out) {
		const placements = mergePlacements(prev.placements, out.placements);
		const reply =
			out.reply ||
			`J'ai placé ${out.placements.length} spec(s) sur la verticale.`;
		return {
			ok: true,
			thread: [...prev.thread, userTurn, asst({ text: reply })],
			placements,
			mode: "llm",
			error: undefined,
		};
	}

	// fallback — the deterministic twin (Claude unavailable), honestly flagged.
	const fb = fallbackPlacements(message);
	return {
		ok: true,
		thread: [
			...prev.thread,
			userTurn,
			asst({ reply: { kind: "fallback", placed: fb.length } }),
		],
		placements: mergePlacements(prev.placements, fb),
		mode: "fallback",
		error: undefined,
	};
}

/**
 * Server Actions for the /ai-lab Workbench cockpit (FK11 — the trialogue).
 *
 * THE STEP (ROADMAP-fke FK11, FKE-38): the AI Lab is the trialogue cockpit composing the EXISTING
 * truths — the FK09 conscience report, the FK08 facet skeleton, S58/S60 graph nav — into one
 * zoomable screen: GAUCHE the chat that PROPOSES slots (never a truth), CENTRE the navigable
 * layer with a 🟢/🔴/🟡 voyant per pair of every facet and the WALL drawn, DROITE the decision
 * cards + blast radius + red wave + promotion gate. Two modes (conversational/navigational) =
 * the same screen at a different zoom.
 *
 * Action-capable (CLAUDE.md §7 ui-completeness): every cockpit op has a control bound to a Server
 * Action running the pure twin lib/ai-lab — load a cockpit (buildCockpit), chat a slot
 * (proposeSlot), click a pair to scope (scopeForPair), validate a card to flip a pair
 * (applyCardValidation). THE WALL (§2): the actions WRITE NOTHING — a direct truth-write from the
 * chat is REFUSED; an above-the-wall card option opens a /goal; the cockpit is a projection.
 * DETERMINISM-FIRST (§8): no LLM enters — the gaps are SemanticDiff/blast, the judge is a calc.
 */

export async function loadCockpitAction(
	_prev: CockpitView,
	formData: FormData,
): Promise<CockpitView> {
	const scenarioId = String(formData.get("scenarioId") ?? "");
	const mode =
		(String(formData.get("mode") ?? DEFAULT_MODE) as Mode) ?? DEFAULT_MODE;
	const sc = scenario(scenarioId);
	if (!sc) {
		return {
			...emptyView,
			error: `scénario inconnu : ${scenarioId || "(vide)"}`,
		};
	}
	const args = { report: sc.report, mode, gate: SAMPLE_GATE };
	const a = buildCockpit(args);
	const b = buildCockpit(args);
	return {
		ok: true,
		state: a,
		deterministic: JSON.stringify(a) === JSON.stringify(b),
	};
}

export async function chatAction(
	_prev: CockpitView,
	formData: FormData,
): Promise<CockpitView> {
	const scenarioId = String(formData.get("scenarioId") ?? "");
	const message = String(formData.get("message") ?? "");
	const facet = (String(formData.get("facet") ?? "F") as Facet) ?? "F";
	const sc = scenario(scenarioId);
	if (!sc) {
		return {
			...emptyView,
			error: `scénario inconnu : ${scenarioId || "(vide)"}`,
		};
	}
	const node: CockpitNode = {
		id: `${sc.report.kernel_id}-${facet}`,
		kind: "operation",
		facet,
	};
	const res = proposeSlot(node, message);
	const state = buildCockpit({ report: sc.report, gate: SAMPLE_GATE });
	if ("refused" in res) {
		return { ok: true, state, refusal: res };
	}
	return { ok: true, state, slot: res };
}

export async function scopePairAction(
	_prev: CockpitView,
	formData: FormData,
): Promise<CockpitView> {
	const scenarioId = String(formData.get("scenarioId") ?? "");
	const pairKey = String(formData.get("pairKey") ?? "");
	const sc = scenario(scenarioId);
	if (!sc) {
		return {
			...emptyView,
			error: `scénario inconnu : ${scenarioId || "(vide)"}`,
		};
	}
	const scope = scopeForPair(sc.report, pairKey);
	const state = buildCockpit({ report: sc.report, gate: SAMPLE_GATE });
	return { ok: true, state, scope };
}

export async function validateCardAction(
	_prev: CockpitView,
	formData: FormData,
): Promise<CockpitView> {
	const scenarioId = String(formData.get("scenarioId") ?? "");
	const cardId = String(formData.get("cardId") ?? "");
	const option = String(formData.get("option") ?? "fix_below_wall");
	const sc = scenario(scenarioId);
	if (!sc) {
		return {
			...emptyView,
			error: `scénario inconnu : ${scenarioId || "(vide)"}`,
		};
	}
	const res = applyCardValidation(sc.report, cardId, option);
	const state = buildCockpit({ report: res.report, gate: SAMPLE_GATE });
	return {
		ok: true,
		state,
		flippedPair: res.flippedPair,
		openedGoal: res.openedGoal,
	};
}
