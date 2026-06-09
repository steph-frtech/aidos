/**
 * first-app-funnel.ts — the DETERMINISTIC core of the S115 onboarding funnel.
 *
 * THE STEP (ROADMAP-app-builder S115): `/first-app` is rewritten from a LOCAL SIMULATION
 * (the retired `FirstAppBuilder` confetti walkthrough) into a guided-but-REAL funnel. Each
 * funnel step computes a REAL artefact through the existing deterministic twins — never a
 * cosmetic "next" with no payload:
 *
 *   signup → project (template-first DEFAULT, blank-idea ADVANCED) → first modification /
 *   idea → grill → goal (red set) → mirror → build-loop GREEN → preview / deploy.
 *
 * Two paths, ONE engine:
 *   • TEMPLATE-FIRST (the default for a newcomer): instantiate a curated S81 starter
 *     (templates.instantiate → a deterministic GREEN starter, content-addressed
 *     starterId) → make a first modification (capture an idea SEEDED by the starter) →
 *     grill → goal → build-loop. A stranger's first run SUCCEEDS because the acceptance
 *     gate is already green at the starter; the modification rides on top.
 *   • BLANK-IDEA (the advanced path): capture a free-text idea (capture-idea.contentAddress)
 *     → grill → goal → build-loop, with NO starter. It can miss the acceptance gate — which
 *     is exactly why it is not the default.
 *
 * DETERMINISM-FIRST (CLAUDE.md §6/§8): the funnel is a PURE, TOTAL state machine. Given the
 * same FunnelInput, `runFunnel` returns a byte-identical FunnelState — the checklist, the
 * artefact ids (starterId, ideaId, redSet, build verdict), and the terminal preview/deploy
 * subdomain are all COMPUTED, never declared, never an LLM. The reproducibility mirror
 * lib/first-app-funnel.test.ts (fast-check) pins same-input → same-output, the closed step
 * ordering, and the exact ids of the canonical sample.
 *
 * THE WALL (CLAUDE.md §2): the funnel WRITES NOTHING. Every artefact is a DRY-RUN value
 * computed by a twin (templates / capture-idea / grilling-loop / goal / build-loop — each
 * the byte-twin of a Go authority that itself respects the wall). The starter-project ROW
 * and the captured-idea ROW would be written BELOW the line by the project/idea-intake path;
 * a kernel truth is landed only via propose → ChangeSet → /goal. The checklist is tied to
 * THESE real artefacts (not confetti): a step is "done" iff its artefact exists and is valid.
 */

import {
	type Decision as BuildDecision,
	type Policy as BuildPolicy,
	isClosed as buildIsClosed,
	noProgress,
	type StopInput,
	terminate,
} from "./build-loop";
import { captureIdea, contentAddress, type Proposes } from "./capture-idea";
import { knownVerdict } from "./grilling-loop";
import { instantiate, type StarterProject, type TemplateId } from "./templates";

/** The two funnel paths — the closed set. The default for a newcomer is template-first. */
export type FunnelPath = "template-first" | "blank-idea";
export const FUNNEL_PATHS: readonly FunnelPath[] = [
	"template-first",
	"blank-idea",
];

/** The DEFAULT path: a stranger succeeds via instantiate→modify, not blank-idea→build. */
export const DEFAULT_PATH: FunnelPath = "template-first";

/**
 * The closed, ORDERED funnel steps. The order is the user's journey: an account, a project,
 * a first modification/idea, grilled, a goal with a red set, a green build, a deploy. Each is
 * a key the checklist reports on. Both paths share the SAME steps — only the project step's
 * payload differs (a starter vs. nothing).
 */
export type FunnelStep =
	| "signup"
	| "project"
	| "idea"
	| "grill"
	| "goal"
	| "build"
	| "deploy";

export const FUNNEL_STEPS: readonly FunnelStep[] = [
	"signup",
	"project",
	"idea",
	"grill",
	"goal",
	"build",
	"deploy",
];

/** The grilling verdict a newcomer's intention received (the human grilled it). */
export type GrillVerdict = "sharp" | "fuzzy" | "bad";

/** The pure input to the whole funnel — same input → same FunnelState. */
export interface FunnelInput {
	path: FunnelPath;
	/** the account email (a real signup; empty = not signed up yet). */
	email: string;
	/** template-first: the curated starter to instantiate. ignored on blank-idea. */
	template: TemplateId;
	/** the target project slug (the app's name). */
	slug: string;
	/** the layer the idea would become (default "operation" — a behaviour to add). */
	proposes: Proposes;
	/** the free-text first modification / idea (template-first SEEDS this; blank requires it). */
	intent: string;
	/** the human grilling verdict on the intention. */
	verdict: GrillVerdict;
	/** the red-set sensors after the build loop ran (mirror ref → green | red). */
	sensors: Record<string, "green" | "red">;
	/** whether the prior green corpus stayed intact through the build. */
	priorGreen: "intact" | "broken";
	/** the achieved mutation score 0..1. */
	mutation: number;
}

/** One checklist row — tied to a REAL artefact, never confetti. */
export interface ChecklistRow {
	step: FunnelStep;
	/** true iff the step's real artefact exists and is valid (COMPUTED, not declared). */
	done: boolean;
	/** the content-addressed / typed artefact this row is bound to ("" until reached). */
	artefact: string;
}

/** The terminal funnel state — every field COMPUTED from the input via a twin. */
export interface FunnelState {
	path: FunnelPath;
	/** the ordered checklist; a step is done iff its artefact is real. */
	checklist: ChecklistRow[];
	/** how many leading steps are done, contiguously (the funnel position). */
	reached: number;
	/** the deterministic starter (template-first only); undefined on blank-idea. */
	starter?: StarterProject;
	/** the content-addressed captured idea id ("" until the idea step). */
	ideaId: string;
	/** the goal's red set (the mirror refs that must go green). */
	redSet: string[];
	/** the non-gameable build verdict (twin of the goal Stop). */
	buildVerdict: BuildDecision["verdict"];
	/** true iff the funnel reached a deployed app driven by the real engine. */
	deployed: boolean;
	/** the deploy subdomain (content-addressed off the slug+starter), "" until deploy. */
	subdomain: string;
}

/** The default red-set floor for a newcomer's first goal (declared, never learned). */
export const MUTATION_FLOOR = 0.6;

/** The build policy a newcomer's first goal runs under (declared envelope). */
export const NEWCOMER_POLICY: BuildPolicy = {
	maxIterations: 12,
	stagnationWindow: 3,
};

/**
 * funnelRedSet — the red set for a newcomer's first goal, COMPUTED from the artefacts:
 * on template-first it is the starter's mirror names PLUS the new modification mirror;
 * on blank-idea it is the single new-behaviour mirror (no starter mirrors to ride on).
 * The mirror ref of the new behaviour is content-addressed off the idea id, so the same
 * idea → the same mirror ref. PURE.
 */
export function funnelRedSet(
	path: FunnelPath,
	starter: StarterProject | undefined,
	ideaId: string,
): string[] {
	const out: string[] = [];
	if (path === "template-first" && starter) {
		for (const m of starter.mirrors) out.push(`mir:${m.name}`);
	}
	if (ideaId !== "") out.push(`mir:modification-${ideaId.slice(0, 12)}`);
	return out;
}

/**
 * deploySubdomain — the content-addressed subdomain the deployed app is served on. It is a
 * deterministic function of the slug and the driving artefact (starterId on template-first,
 * ideaId on blank-idea), so the same funnel input → the same subdomain. PURE.
 */
export function deploySubdomain(
	slug: string,
	starter: StarterProject | undefined,
	ideaId: string,
): string {
	const anchor = starter ? starter.starter_id : ideaId;
	return contentAddress("product", `${slug}@${anchor}`, {
		source: "human",
		detail: "first-app-deploy",
	}).slice(0, 16);
}

const EMPTY_ROW = (step: FunnelStep): ChecklistRow => ({
	step,
	done: false,
	artefact: "",
});

/**
 * runFunnel — the PURE, TOTAL state machine. It threads the FunnelInput through the real
 * twins, computing each step's artefact and marking the checklist row done iff that artefact
 * is real and valid. It STOPS at the first step whose artefact cannot be produced (honest:
 * an empty email blocks at signup; a bad grill verdict blocks at grill; a non-green build
 * blocks at build) — the checklist below that step stays not-done. Same input → same output.
 */
export function runFunnel(input: FunnelInput): FunnelState {
	const checklist: ChecklistRow[] = FUNNEL_STEPS.map(EMPTY_ROW);
	const at = (s: FunnelStep) => checklist[FUNNEL_STEPS.indexOf(s)];

	let starter: StarterProject | undefined;
	let ideaId = "";
	let redSet: string[] = [];
	let buildVerdict: BuildDecision["verdict"] = "continue";
	let deployed = false;
	let subdomain = "";

	// --- signup: a real account (a non-empty email). ---
	const email = input.email.trim();
	if (email === "") {
		return finalize(
			input.path,
			checklist,
			starter,
			ideaId,
			redSet,
			buildVerdict,
			deployed,
			subdomain,
		);
	}
	at("signup").done = true;
	at("signup").artefact = `account:${email}`;

	// --- project: template-first instantiates a deterministic GREEN starter; blank-idea has none. ---
	const slug = input.slug.trim();
	if (slug === "") {
		return finalize(
			input.path,
			checklist,
			starter,
			ideaId,
			redSet,
			buildVerdict,
			deployed,
			subdomain,
		);
	}
	if (input.path === "template-first") {
		try {
			starter = instantiate(input.template, slug);
		} catch {
			return finalize(
				input.path,
				checklist,
				starter,
				ideaId,
				redSet,
				buildVerdict,
				deployed,
				subdomain,
			);
		}
		at("project").done = true;
		at("project").artefact = `starter:${starter.starter_id.slice(0, 16)}`;
	} else {
		// blank-idea: the project exists as a slug, no starter (the advanced path).
		at("project").done = true;
		at("project").artefact = `project:${slug}`;
	}

	// --- idea / first modification: a real content-addressed captured idea. ---
	const intent = input.intent.trim();
	if (intent === "") {
		return finalize(
			input.path,
			checklist,
			starter,
			ideaId,
			redSet,
			buildVerdict,
			deployed,
			subdomain,
		);
	}
	ideaId = contentAddress(input.proposes, intent, {
		source: "human",
		detail:
			input.path === "template-first" ? "first-modification" : "blank-idea",
	});
	at("idea").done = true;
	at("idea").artefact = `idea:${ideaId.slice(0, 16)}`;

	// --- grill: the human grilled the intention; only "sharp" advances toward a goal. ---
	if (!knownVerdict(input.verdict)) {
		return finalize(
			input.path,
			checklist,
			starter,
			ideaId,
			redSet,
			buildVerdict,
			deployed,
			subdomain,
		);
	}
	at("grill").artefact = `verdict:${input.verdict}`;
	if (input.verdict !== "sharp") {
		// fuzzy → /spike, bad → rejected: the funnel does not reach a goal (honest, not confetti).
		return finalize(
			input.path,
			checklist,
			starter,
			ideaId,
			redSet,
			buildVerdict,
			deployed,
			subdomain,
		);
	}
	at("grill").done = true;

	// --- goal: the red set is COMPUTED from the artefacts (starter mirrors + the modification mirror). ---
	redSet = funnelRedSet(input.path, starter, ideaId);
	at("goal").artefact = `redset:${redSet.length}`;
	at("goal").done = redSet.length > 0;
	if (!at("goal").done) {
		return finalize(
			input.path,
			checklist,
			starter,
			ideaId,
			redSet,
			buildVerdict,
			deployed,
			subdomain,
		);
	}

	// --- build: the NON-GAMEABLE Stop decides green; the funnel never declares it. ---
	const stop: StopInput = {
		sensors: input.sensors,
		priorGreen: input.priorGreen,
		mutation: input.mutation,
		mutationFloor: MUTATION_FLOOR,
		monsters: [],
	};
	const closed = buildIsClosed(redSet, stop);
	buildVerdict = computeBuildVerdict(redSet, stop);
	at("build").artefact = `build:${buildVerdict}`;
	at("build").done = closed && buildVerdict === "green";
	if (!at("build").done) {
		return finalize(
			input.path,
			checklist,
			starter,
			ideaId,
			redSet,
			buildVerdict,
			deployed,
			subdomain,
		);
	}

	// --- deploy: the app is served on a content-addressed subdomain (driven by the real engine). ---
	subdomain = deploySubdomain(slug, starter, ideaId);
	deployed = true;
	at("deploy").done = true;
	at("deploy").artefact = `deploy:${subdomain}`;

	return finalize(
		input.path,
		checklist,
		starter,
		ideaId,
		redSet,
		buildVerdict,
		deployed,
		subdomain,
	);
}

/**
 * computeBuildVerdict — the build verdict via the SAME non-gameable terminate (twin of the Go
 * authority). With an empty history the breaker is "not stuck yet", so the verdict is "green"
 * iff the Stop closes, else "continue" (the funnel surfaces a still-red build, never fakes a
 * green). A no-progress history would surface "no_progress" — but a newcomer's first build is
 * modelled with no history (one shot), so the terminate result is green-or-continue. PURE.
 */
export function computeBuildVerdict(
	redSet: string[],
	stop: StopInput,
): BuildDecision["verdict"] {
	const decision = terminate({
		redSet,
		stop,
		history: [],
		policy: NEWCOMER_POLICY,
		budget: { maxLlmTokensPerGoal: 0, maxCiMinutes: 0 },
		cost: { llmTokens: 0, ciMinutes: 0 },
		valueCaseJustified: false,
	});
	// guard: keep the no-progress detector referenced (a one-shot build has no history).
	if (noProgress([], NEWCOMER_POLICY)) return "no_progress";
	return decision.verdict;
}

function finalize(
	path: FunnelPath,
	checklist: ChecklistRow[],
	starter: StarterProject | undefined,
	ideaId: string,
	redSet: string[],
	buildVerdict: BuildDecision["verdict"],
	deployed: boolean,
	subdomain: string,
): FunnelState {
	// reached = the count of leading contiguously-done steps (the honest funnel position).
	let reached = 0;
	for (const row of checklist) {
		if (!row.done) break;
		reached++;
	}
	return {
		path,
		checklist,
		reached,
		starter,
		ideaId,
		redSet,
		buildVerdict,
		deployed,
		subdomain,
	};
}

/** captureFunnelIdea — re-derive the funnel's captured idea object (for the UI + tests). PURE. */
export function captureFunnelIdea(input: FunnelInput) {
	return captureIdea(input.proposes, input.intent.trim(), {
		source: "human",
		detail:
			input.path === "template-first" ? "first-modification" : "blank-idea",
	});
}
