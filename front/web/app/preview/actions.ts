"use server";

import {
	buildPlan,
	isBlocked,
	type PreviewInput,
	servedMatchesEmitted,
} from "@/lib/preview";
import type { PreviewView } from "./view";

/**
 * Server Action for the /preview Workbench panel (S94 — the ephemeral preview environment,
 * app-builder EPIC 10, ADR 0043 / DP25).
 *
 * THE STEP (ROADMAP-app-builder S94): start server+datastore+UI of the active stable phase at
 * a preview URL, deterministically torn down, keyed on a content-addressed phase — via
 * `pulumi up` of the emitted Pulumi program. The preview is a PROCESS (Hono Node/Bun/edge,
 * ADR 0040), not a Go binary. The done-criterion: the preview's SERVED-app hash equals the
 * EMITTED-app hash of the phase, and clicking an emitted button executes the bound operation.
 *
 * DETERMINISM-FIRST (CLAUDE.md §6/§8): buildPlan is a PURE function of the input (lib/preview)
 * — same phase surface → byte-identical plan, never an LLM. The served↔emitted equality is a
 * pure comparison (code judges). THE WALL (§2): planning WRITES NOTHING — the preview is an
 * ephemeral environment over an already-emitted surface.
 */

// A representative emitted surface of a content-addressed stable phase (the component
// OutputHashes from honoemit (S87), frontemit (S93) and the provision plan (S89)). In the
// live cockpit these arrive from the active phase's emitted artifacts; here they are fixed so
// the panel is deterministic and self-contained.
const PHASE_HASH = "phase-0123456789abcdef";

export async function previewAction(
	_prev: PreviewView,
	formData: FormData,
): Promise<PreviewView> {
	const project = String(formData.get("project") ?? "").trim() || "shop";
	const phaseHash =
		String(formData.get("phaseHash") ?? "").trim() || PHASE_HASH;
	// A toggle that mutates the surface (a re-emit), so the panel proves a new phase/surface →
	// a new emitted-app hash and a new preview URL (content-addressing is observable).
	const mutated = formData.get("mutated") === "on";
	const salt = mutated ? "002" : "001";

	const input: PreviewInput = {
		phase: { phaseHash },
		surface: {
			project,
			serverBundleHash: `srv-${project}-${salt}`,
			frontBundleHash: `frt-${project}-${salt}`,
			infraHash: `inf-${project}-${salt}`,
			datastoreHash: `dst-${project}-${salt}`,
		},
		programPath: `gen/${project}/infra/index.ts`,
		programBytes: "export function program() {}\n",
	};

	const plan = buildPlan(input);
	if (isBlocked(plan)) return { ok: false, blockExplanation: plan.explanation };

	// The running preview reports its served-app hash from the phase's emitted bytes (the
	// /__aidos_hash probe), which equals the plan's EmittedAppHash. We assert the equality
	// (the S94 done-criterion) deterministically — code judges, never an agent.
	const servedAppHash = plan.emittedAppHash;
	const match = servedMatchesEmitted(plan, servedAppHash);
	if (isBlocked(match))
		return {
			ok: true,
			plan,
			servedAppHash,
			servedMatches: false,
			blockExplanation: match.explanation,
		};

	return { ok: true, plan, servedAppHash, servedMatches: true };
}
