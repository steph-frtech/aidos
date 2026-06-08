import type { CapturedIdea, Proposes } from "./capture-idea";
import { captureIdea } from "./capture-idea";
import { type GrillVerdict, routeVerdict, verdicts } from "./exploration";

/**
 * grilling-loop.ts — the deterministic TS twin of back/runtime/grillingloop (S65).
 *
 * THE STEP (ROADMAP S65): the in-product, conversational grilling loop. A human grills
 * an INTENTION (prose intent + ≤ 5 candidate scenarios) and routes it on the closed
 * three-value verdict (sharp → grilled ; fuzzy → spiking ; bad → rejected, traced),
 * recording the verdict + provenance. The routing is DETERMINISTIC and AUTHORITATIVE;
 * the LLM is the gated exception for the DIALOGUE only, its suggested verdict re-checked
 * against the verdict schema (verifyLlmVerdict) before it can route anything.
 *
 * THE TWIN (no drift): this module mirrors the Go authority byte-for-byte — the SAME
 * MAX_SCENARIOS bound, the SAME routing (reuses routeVerdict from lib/exploration, the
 * S28 twin), the SAME content-addressed id (reuses captureIdea, the S64 twin). The
 * reproducibility mirror lib/grilling-loop.test.ts (fast-check) pins it.
 *
 * THE WALL (CLAUDE.md §2): the routed idea is a CANDIDATE-truth on the `ideas` schema
 * (staging ABOVE the product but BELOW the freeze) — no version, no mirror. The Server
 * Action persists the routed status row directly (the below-the-line write path, the
 * agent role has INSERT/SELECT/UPDATE on ideas). Promotion to a kernel truth is /goal,
 * never a write from this screen.
 */

/** MAX_SCENARIOS — the ≤ 5 scenarios surface bound (twin of grillingloop.MaxScenarios). */
export const MAX_SCENARIOS = 5;

/** An intention a human grills — prose intent + AT MOST MAX_SCENARIOS candidate scenarios. */
export interface Intention {
	intent: string;
	scenarios: string[];
}

/** The closed reason an intention is invalid (the loop refuses to route on it). */
export type IntentionError = "intent-empty" | "too-many-scenarios";

/**
 * validateIntention — the intention surface contract (twin of Intention.Validate): a
 * non-empty intent and AT MOST MAX_SCENARIOS scenarios. Returns null when valid. Pure.
 */
export function validateIntention(it: Intention): IntentionError | null {
	if (it.intent.trim() === "") return "intent-empty";
	if (it.scenarios.length > MAX_SCENARIOS) return "too-many-scenarios";
	return null;
}

/** A routed idea — a CapturedIdea whose status is the verdict's lane, plus a traced reject reason. */
export interface RoutedIdea extends CapturedIdea {
	/** Non-empty only when status === "rejected" (the traced reason, kept; never deleted). */
	rejectReason?: string;
}

/** A recorded verdict — the routed idea + the verdict + the traced reason (twin of VerdictRecord). */
export interface VerdictRecord {
	idea: RoutedIdea;
	verdict: GrillVerdict;
	/** Non-empty only for the "bad" verdict (the traced rejection reason). */
	reason?: string;
}

/** knownVerdict — true iff v is in the closed three-value set (twin of grillingloop.KnownVerdict). */
export function knownVerdict(v: string): v is GrillVerdict {
	return (verdicts() as string[]).includes(v);
}

/**
 * route — the S65 grilling loop (twin of grillingloop.Route). It validates the
 * intention, content-addresses it as a draft idea (HUMAN provenance — the surface is a
 * human grilling), and routes it DETERMINISTICALLY on the verdict. Throws on an invalid
 * intention or an unknown verdict; the routing is the authority. detail empty falls
 * back to the intent. The status is computed by routeVerdict (the S28 twin), never here.
 */
export function route(
	proposes: Proposes,
	it: Intention,
	verdict: GrillVerdict,
	detail: string,
	reason: string,
): VerdictRecord {
	const err = validateIntention(it);
	if (err) throw new Error(`grilling-loop: ${err}`);
	if (!knownVerdict(verdict)) {
		throw new Error(`grilling-loop: unknown verdict ${verdict}`);
	}
	const provDetail = detail.trim() === "" ? it.intent : detail;
	const draft = captureIdea(proposes, it.intent, {
		source: "human",
		detail: provDetail,
	});
	const status = routeVerdict(verdict);
	const idea: RoutedIdea = {
		...draft,
		status,
		...(verdict === "bad" ? { rejectReason: reason } : {}),
	};
	const rec: VerdictRecord = { idea, verdict };
	if (verdict === "bad") rec.reason = reason;
	return rec;
}

/**
 * verifyLlmVerdict — the re-verification gate for the barricaded LLM exception (twin of
 * grillingloop.VerifyLLMVerdict). It takes a RAW verdict string a dialogue model
 * produced and returns the typed verdict ONLY if it validates against the closed schema,
 * else null. The match is exact and case-sensitive: "Sharp", "approved", "yes" are all
 * off-schema. This keeps the LLM from inventing a fourth verdict — the schema is
 * authoritative; the model only proposes a value the code re-checks. Pure.
 */
export function verifyLlmVerdict(raw: string): GrillVerdict | null {
	return knownVerdict(raw) ? raw : null;
}
