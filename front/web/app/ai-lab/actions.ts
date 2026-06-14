"use server";

import { execFile } from "node:child_process";
import { promisify } from "node:util";
import {
	applyCardValidation,
	buildCockpit,
	type ChatTurn,
	type CockpitNode,
	type DagImpact,
	EXISTING_DAG,
	isTruthWriteRequest,
	type Level,
	MIRROR_PAIRS,
	type Mode,
	mergeImpacts,
	mergePlacements,
	nextPairId,
	type Placement,
	proposeSlot,
	scopeForPair,
	turnId,
	VERTICAL_LEVELS,
	validateAndDescend,
	validateImpacts,
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
		"",
		"Le besoin peut aussi IMPACTER des specs DÉJÀ présentes dans le DAG du projet. En voici la liste (id — titre) :",
		...EXISTING_DAG.map((s) => `  • ${s.id} — ${s.title}`),
		"Identifie lesquelles ce besoin touche (la « vague de rouge ») avec une raison courte. N'invente aucun id ; n'en mets aucune si rien n'est touché.",
		"",
		"Réponds UNIQUEMENT par un objet JSON valide, sans aucun texte autour, de la forme :",
		'{"reply":"<1-2 phrases conversationnelles en français>","placements":[{"level":"...","facet":"F","pairId":"spec","spec":"..."}],"impacts":[{"specId":"d-entite-cart","reason":"..."}]}',
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
async function callClaude(message: string): Promise<{
	reply: string;
	placements: Placement[];
	impacts: DagImpact[];
} | null> {
	try {
		const { stdout } = await execFileP(
			CLAUDE_BIN,
			[
				"-p",
				leftBrainPrompt(message),
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
		const placements = validatePlacements(inner?.placements);
		const impacts = validateImpacts(inner?.impacts);
		const reply = typeof inner?.reply === "string" ? inner.reply.trim() : "";
		if (!reply && placements.length === 0 && impacts.length === 0) return null;
		return { reply, placements, impacts };
	} catch {
		return null;
	}
}

// ── Deploy — EMIT the app from the project specs, then launch its docker, show the live result ──
//
// The « Déployer & voir » button (1) RE-EMITS the app's data layer from the project's entité specs
// (the AIDOS emitter `aidosappemit` → DDL + entities.json, best-effort), then (2) runs
// `docker compose up -d` on the emitted app's FIXED stack (idempotent ; no user input → no
// injection). It reports the live URL. THE WALL §2: a below-the-line projection action (emit +
// run the emitted app), never a truth write. OpenQuestion (sécurité) : a public button that execs
// emit/docker — gate it (auth/rate-limit) before real exposure ; here it targets one fixed stack.
const APP_STACK =
	process.env.AIDOS_APP_STACK ||
	"/data/dev/aidos/.deploy-app/app/docker-compose.yml";
const APP_URL = process.env.AIDOS_APP_URL || "https://alphashop.sagedesk.fr";
const APP_REPO = process.env.AIDOS_REPO || "/data/dev/aidos";

// Exporté (server-to-server) : /v2/builder réutilise CE pipeline pour son « Déploiement réel »
// (ADR 0052) — le même geste gaté, jamais un second chemin de déploiement.
export async function deployStack(): Promise<{
	status: "up" | "error";
	url: string;
	detail: string;
}> {
	// (1) re-emit the app's data layer from the project's entity specs (best-effort).
	let emitNote = "réémission ignorée";
	try {
		await execFileP("go", ["run", "./cmd/aidosappemit"], {
			cwd: `${APP_REPO}/back`,
			timeout: 120_000,
			maxBuffer: 8 * 1024 * 1024,
			env: { ...process.env, GOTOOLCHAIN: "auto" },
		});
		emitNote = "specs → DDL + entities.json (aidosappemit)";
	} catch {
		emitNote = "app déjà émise (réémission indisponible)";
	}
	// (2) launch the emitted app's stack.
	try {
		await execFileP("docker", ["compose", "-f", APP_STACK, "up", "-d"], {
			timeout: 180_000,
			maxBuffer: 8 * 1024 * 1024,
		});
		return {
			status: "up",
			url: APP_URL,
			detail: `${emitNote} · docker compose up -d`,
		};
	} catch (e) {
		return { status: "error", url: APP_URL, detail: String(e).slice(0, 240) };
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

/** The human label of the pair Claude must write during the descent. */
const PAIR_WRITE_LABEL: Record<string, string> = {
	behavior: "Comportement attendu (use cases)",
	scenarios: "Scénarios Given/When/Then",
	model: "Modèle de données (sens humain)",
	contract: "Contrat (in/out, pré/post, invariants)",
	evidence: "Evidence attendue (ce qui prouvera le contrat)",
};

/**
 * enrichNextPair — Claude WRITES the next anatomy pair from the validated spec (a real
 * comportement from the spec, real scénarios from the comportement, …). The gated exception
 * (§6): irreducible prose generation, VERIFIED by length-clamping ; returns null on any failure so
 * the caller falls back to the deterministic template. The wall §2: a proposal, no truth written.
 */
async function enrichNextPair(
	level: Level,
	facet: Facet,
	toPair: string,
	parentSpec: string,
): Promise<{ spec: string; detail: string } | null> {
	const label = PAIR_WRITE_LABEL[toPair] ?? toPair;
	const prompt = [
		"Tu es le CERVEAU GAUCHE d'AIDOS. À partir d'une spec déjà validée, rédige la PAIRE SUIVANTE de l'anatomie. Tu PROPOSES, tu n'écris jamais la vérité.",
		`Niveau : ${level} · Facette : ${facet}`,
		`Spec validée : « ${parentSpec.replace(/"/g, "'")} »`,
		`Rédige la « ${label} » qui en découle, concrète et vérifiable.`,
		'Réponds UNIQUEMENT par un JSON valide : {"spec":"<1 phrase>","detail":"<2-3 phrases ou critères>"}',
	].join("\n");
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
			{ cwd: "/tmp", timeout: 150_000, maxBuffer: 8 * 1024 * 1024 },
		);
		const outer = JSON.parse(stdout);
		const text = typeof outer?.result === "string" ? outer.result : "";
		const inner = JSON.parse(extractJson(text));
		const spec =
			typeof inner?.spec === "string" ? inner.spec.trim().slice(0, 280) : "";
		const detail =
			typeof inner?.detail === "string"
				? inner.detail.trim().slice(0, 600)
				: "";
		if (!spec) return null;
		return { spec, detail };
	} catch {
		return null;
	}
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
	const intent = String(formData.get("intent") ?? "chat");

	// NAVIGATION — open a cell of the big table (level × facet); its anatomy descent is shown.
	if (intent === "select") {
		const level = String(formData.get("level") ?? "") as Level;
		const facet = String(formData.get("facet") ?? "") as Facet;
		if (!VERTICAL_LEVELS.includes(level)) return prev;
		return { ...prev, selectedCell: { level, facet }, error: undefined };
	}

	// DESCENT — validate a pair (level × facet × pairId) → generate the next pair down the anatomy.
	// Claude ENRICHES the next pair's content (a real comportement written from the spec); the
	// STRUCTURE (which pair, the placement) stays deterministic, and a template fallback covers a
	// Claude failure (§6: only the prose is the gated exception, verified by length-clamping).
	if (intent === "validate") {
		const level = String(formData.get("level") ?? "") as Level;
		const facet = String(formData.get("facet") ?? "") as Facet;
		const pairId = String(formData.get("pairId") ?? "");
		const next = nextPairId(pairId);
		const parent = prev.placements.find(
			(p) => p.level === level && p.facet === facet && p.pairId === pairId,
		);
		let override: { spec: string; detail?: string } | undefined;
		if (next && parent)
			override =
				(await enrichNextPair(level, facet, next, parent.spec)) ?? undefined;
		return {
			...prev,
			placements: validateAndDescend(
				prev.placements,
				level,
				facet,
				pairId,
				override,
			),
			selectedCell: { level, facet },
			error: undefined,
		};
	}

	// DEPLOY — emit the app from the project specs, launch its docker, show the live result.
	if (intent === "deploy") {
		const res = await deployStack();
		return {
			...prev,
			deploy: {
				status: res.status,
				url: APP_URL,
				app: "Alpha Shop",
				entities: ["Product", "Cart", "Order", "Payment", "Stock"],
				image: "postgres:16-alpine",
				detail: res.detail,
			},
			error: undefined,
		};
	}

	// CHAT — a need → Claude places specs across the verticale + impacts the existing DAG.
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
		const impacts = mergeImpacts(prev.impacts, out.impacts);
		const reply =
			out.reply ||
			`J'ai placé ${out.placements.length} spec(s) sur la verticale, et touché ${out.impacts.length} spec(s) du DAG existant.`;
		return {
			ok: true,
			thread: [...prev.thread, userTurn, asst({ text: reply })],
			placements,
			impacts,
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
		impacts: prev.impacts,
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
