"use server";

import type { Proposes } from "@/lib/capture-idea";
import {
	type FunnelInput,
	type FunnelPath,
	type FunnelState,
	type GrillVerdict,
	runFunnel,
} from "@/lib/first-app-funnel";
import type { TemplateId } from "@/lib/templates";

/**
 * Server Actions for the /first-app Workbench funnel (S115 — « Vrai funnel d'onboarding »).
 *
 * THE STEP (ROADMAP-app-builder S115): `/first-app` is a guided-but-REAL funnel, not a
 * simulation. The user signs up, creates a project (template-first by default, blank-idea
 * advanced), makes a first modification / idea, grills it, opens a goal, drives the build
 * loop to green, and deploys — each step producing a REAL artefact through the deterministic
 * twins. This action runs the PURE funnel state machine (lib/first-app-funnel) and returns
 * the computed FunnelState the panel renders.
 *
 * THE WALL (§2/§7): the action WRITES NOTHING. Every artefact (starterId, ideaId, red set,
 * build verdict, deploy subdomain) is a DRY-RUN value computed by a twin (templates /
 * capture-idea / grilling-loop / goal / build-loop), each the byte-twin of a Go authority
 * that respects the wall. Landing the starter's truths goes via the legal door
 * (propose → ChangeSet → /goal), never a direct write from this screen. The checklist is
 * tied to these real artefacts (a step is done iff its artefact exists), never confetti.
 *
 * DETERMINISM-FIRST (§6/§8): the funnel is a pure function; the same FormData → the same
 * FunnelState. No LLM enters the funnel — the grilling verdict is a HUMAN input, the build
 * verdict is the non-gameable Stop, both deterministic.
 */

const VERDICTS = new Set<GrillVerdict>(["sharp", "fuzzy", "bad"]);
const PATHS = new Set<FunnelPath>(["template-first", "blank-idea"]);
const TEMPLATES = new Set<TemplateId>(["ecommerce", "crm", "booking"]);

function asVerdict(v: string): GrillVerdict {
	return VERDICTS.has(v as GrillVerdict) ? (v as GrillVerdict) : "fuzzy";
}
function asPath(v: string): FunnelPath {
	return PATHS.has(v as FunnelPath) ? (v as FunnelPath) : "template-first";
}
function asTemplate(v: string): TemplateId {
	return TEMPLATES.has(v as TemplateId) ? (v as TemplateId) : "ecommerce";
}

/**
 * runFunnelAction — the funnel control (CLAUDE.md §7 ui-completeness). It reads the form,
 * runs the PURE funnel, and returns the FunnelState. Sensors default to all-green for the
 * declared red set (the happy build) unless the form forces one red (the "watch it fail"
 * toggle), so the screen can demonstrate BOTH a green deploy and an honest non-green stop.
 */
export async function runFunnelAction(
	_prev: FunnelState | null,
	formData: FormData,
): Promise<FunnelState> {
	const path = asPath(String(formData.get("path") ?? "template-first"));
	const email = String(formData.get("email") ?? "").trim();
	const template = asTemplate(String(formData.get("template") ?? "ecommerce"));
	const slug = String(formData.get("slug") ?? "").trim();
	const intent = String(formData.get("intent") ?? "").trim();
	const verdict = asVerdict(String(formData.get("verdict") ?? "sharp"));
	// the build outcome the funnel models: "green" makes every red-set sensor green,
	// "red" forces one red (an honest non-green build — no deploy).
	const buildOutcome = String(formData.get("build") ?? "green");
	const mutation = buildOutcome === "low-mutation" ? 0.3 : 0.9;

	// First pass with empty sensors to learn the red set, then build the sensor map.
	const probe = runFunnel({
		path,
		email,
		template,
		slug,
		proposes: "operation" as Proposes,
		intent,
		verdict,
		sensors: {},
		priorGreen: "intact",
		mutation,
	});
	const sensors: Record<string, "green" | "red"> = {};
	probe.redSet.forEach((ref, i) => {
		sensors[ref] = buildOutcome === "red" && i === 0 ? "red" : "green";
	});

	const input: FunnelInput = {
		path,
		email,
		template,
		slug,
		proposes: "operation" as Proposes,
		intent,
		verdict,
		sensors,
		priorGreen: "intact",
		mutation,
	};
	return runFunnel(input);
}
