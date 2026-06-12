"use server";

import { composeEnvRefs, envKeys, isClean } from "@/lib/env-emit";
import { emitStackBundle } from "@/lib/phase-emit";
import type { StackManifest } from "@/lib/stack-manifest";
import type { EmitView } from "./view";

/**
 * Server Action for the /stack-emit Workbench panel (DP03 + DP04 + DP05 —
 * the closed kind × target matrix, composed).
 *
 * THE GESTURE (ui-completeness, CLAUDE.md §7): the panel's one control
 * « ré-émettre » runs the PURE DP05 composition of the TS twin
 * (lib/phase-emit, byte-parity-pinned to the authoritative Go
 * back/runtime/stackemit) over the manifest JSON on screen — validate (the
 * DP02 closed codes), pin the manifest in its S23 phase (PhaseFor), emit the
 * COMPLETE 5-artifact bundle {compose, .env.example, start.sh,
 * start_with_rebuild.sh, traefik.dynamic.yml} and triple-address it
 * (phase_version · source_hash · bundle_hash). « Ré-émettre deux fois, hash
 * égaux » is one comparison: bundle_hash == seeded bundle_hash.
 *
 * THE WALL (CLAUDE.md §2): this action is a PURE MEASURE — it WRITES NOTHING
 * (no gen/ file, no truth). The phase (source) is authoritative; the emitted
 * code is regenerable, never the reverse. In Go, a hand-edited gen/ file
 * blocks the re-emission with EMITTED_FILE_HAND_EDITED (fail-closed).
 */
export async function emitAction(
	_prev: EmitView,
	formData: FormData,
): Promise<EmitView> {
	const raw = String(formData.get("manifestJson") ?? "");
	const seededOutputHash = String(formData.get("seededOutputHash") ?? "");

	let manifest: StackManifest;
	try {
		manifest = JSON.parse(raw) as StackManifest;
	} catch (e) {
		return {
			ok: false,
			parseError: e instanceof Error ? e.message : String(e),
		};
	}

	// DP05 — ONE composition emits everything (DP03 compose + DP04 env bundle
	// + the traefik dynamic config), from the manifest pinned in its phase.
	// The secret scan and the DP03↔DP04↔DP05 coherence are computed
	// deterministically (code, never an LLM).
	const bundle = await emitStackBundle(manifest);
	if ("refusal" in bundle) {
		return { ok: false, refusal: bundle.refusal };
	}
	const seededEnvOutputHash = String(formData.get("seededEnvOutputHash") ?? "");
	const seededBundleHash = String(formData.get("seededBundleHash") ?? "");
	const keys = new Set(envKeys(bundle.env.envExample.text));
	const coherent = [bundle.compose.yaml, bundle.traefikDynamic.text].every(
		(src) => composeEnvRefs(src).every((ref) => keys.has(ref)),
	);
	return {
		ok: true,
		yaml: bundle.compose.yaml,
		outputHash: bundle.compose.outputHash,
		sourceHash: bundle.sourceHash,
		path: bundle.compose.path,
		sameAsSeeded: bundle.compose.outputHash === seededOutputHash,
		envText: bundle.env.envExample.text,
		envOutputHash: bundle.env.envExample.outputHash,
		startShOutputHash: bundle.env.startSh.outputHash,
		rebuildOutputHash: bundle.env.startWithRebuild.outputHash,
		envClean:
			isClean(bundle.env.envExample.text) &&
			isClean(bundle.traefikDynamic.text),
		coherent,
		sameEnvAsSeeded: bundle.env.envExample.outputHash === seededEnvOutputHash,
		phaseVersion: bundle.phaseVersion,
		bundleHash: bundle.bundleHash,
		traefikText: bundle.traefikDynamic.text,
		traefikOutputHash: bundle.traefikDynamic.outputHash,
		sameBundleAsSeeded: bundle.bundleHash === seededBundleHash,
	};
}
