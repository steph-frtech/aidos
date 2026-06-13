"use server";

import { composeEnvRefs, envKeys, isClean } from "@/lib/env-emit";
import { emitStackBundle } from "@/lib/phase-emit";
import { emitCompose, filterByProfile, isProfileBlock } from "@/lib/stack-emit";
import { profiledManifest, type StackManifest } from "@/lib/stack-manifest";
import type { EmitView, ProfileEmitView } from "./view";

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

/**
 * emitProfileAction — the DP11 PROFILE gesture (ui-completeness, CLAUDE.md §7):
 * the selector's chosen profile NARROWS the profiled manifest deterministically
 * (lib/stack-emit.filterByProfile — the pure include/exclude over the closed set,
 * byte-parity-pinned to Go composeemit.FilterByProfile) and re-emits the compose
 * of the narrowed manifest. Services appear/disappear by selection; `full` is the
 * UNION; an out-of-set profile → UNKNOWN_PROFILE; the cross non-prod × prod →
 * DOLTGRES_NOT_ALLOWED_IN_PROD (the DP06 rule reused verbatim, never forked).
 *
 * THE WALL (§2): the profiles are DECLARED above the line in stack_manifest; the
 * SELECTION is a below-the-line measure applied at emission. This action WRITES
 * NOTHING — it reads the AST and returns a narrowed AST + bytes.
 */
export async function emitProfileAction(
	_prev: ProfileEmitView,
	formData: FormData,
): Promise<ProfileEmitView> {
	const profile = String(formData.get("profile") ?? "");
	const env = String(formData.get("env") ?? "dev");
	const manifest: StackManifest = profiledManifest();

	// (1) the pure include/exclude over the closed set — the profile is a
	// DECLARED parameter, never inferred. An out-of-set selection or the
	// non-prod × prod cross returns a DP11 BlockReason.
	const filtered = filterByProfile(manifest, profile, env);
	if (isProfileBlock(filtered)) {
		return {
			ok: false,
			profile,
			env,
			totalCount: manifest.services.length,
			block: filtered.block,
		};
	}

	// (2) emit the compose of the NARROWED manifest (a server always survives,
	// so the emission never refuses STACK_HAS_NO_SERVER for a core-bearing stack).
	const emitted = await emitCompose(filtered);
	if ("refusal" in emitted) {
		return {
			ok: false,
			profile,
			env,
			totalCount: manifest.services.length,
			block: { code: emitted.refusal.code, message: emitted.refusal.message },
		};
	}

	return {
		ok: true,
		profile,
		env,
		yaml: emitted.yaml,
		outputHash: emitted.outputHash,
		sourceHash: emitted.sourceHash,
		keptServices: filtered.services.map((s) => s.name),
		keptCount: filtered.services.length,
		totalCount: manifest.services.length,
	};
}
